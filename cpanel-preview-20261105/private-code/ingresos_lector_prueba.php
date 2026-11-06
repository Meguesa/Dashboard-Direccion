<?php
declare(strict_types=1);
/**
 * Lector temporal de Ingresos, SOLO LECTURA, biblioteca privada.
 * Hoja origen: BANAMEX/BANREGIO/CAJA/JDJP/CUENTA 18.
 * No puede publicar cache ni modificar archivos originales.
 * Revisado contra la estructura de OCTUBRE 2026.xlsx.
 */
const JJP_PRIVATE_DIR = __DIR__;
const JJP_COBRANZA_DRIVE_ID = 'b!EAWNGReAT02APufy0uQPFnDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c';
const JJP_PORTAL_CLIENT_ID = '9cfc9e30-6dd2-45b4-96fe-5d5b69de0015';
const JJP_MAX_XLSX_BYTES = 60000000;
umask(0077);

function readXml(ZipArchive $zip, string $path): DOMDocument
{
    $xml = $zip->getFromName($path);
    if ($xml === false) throw new RuntimeException('Falta parte XLSX: ' . $path);
    $doc = new DOMDocument();
    if (!$doc->loadXML($xml, LIBXML_NONET)) throw new RuntimeException('XML invalido: ' . $path);
    return $doc;
}

function getWorksheetPath(ZipArchive $zip, string $sheetName): string
{
    $workbook = readXml($zip, 'xl/workbook.xml');
    $xp = new DOMXPath($workbook);
    $xp->registerNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $matches = $xp->query('//x:sheet[@name="' . $sheetName . '"]');
    if (!$matches || $matches->length !== 1) throw new RuntimeException('Hoja faltante: ' . $sheetName);
    $rid = $matches->item(0)->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    if ($rid === '') throw new RuntimeException('No existe la relacion de hoja.');
    $rels = readXml($zip, 'xl/_rels/workbook.xml.rels');
    $rx = new DOMXPath($rels);
    $rx->registerNamespace('r', 'http://schemas.openxmlformats.org/package/2006/relationships');
    $nodes = $rx->query('//r:Relationship[@Id="' . $rid . '"]');
    if (!$nodes || $nodes->length !== 1) throw new RuntimeException('No se encontro el archivo de hoja.');
    $target = $nodes->item(0)->getAttribute('Target');
    $path = str_starts_with($target, '/') ? ltrim($target, '/') : 'xl/' . $target;
    // Reject traversal and references to external files.
    if (str_contains($path, '..') || !str_starts_with($path, 'xl/worksheets/')) {
        throw new RuntimeException('Ruta de hoja invalida.');
    }
    return $path;
}

function coverSheetName(ZipArchive $zip): ?string
{
    $workbook = readXml($zip, 'xl/workbook.xml');
    $xp = new DOMXPath($workbook);
    $xp->registerNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $sheets = $xp->query('//x:sheets/x:sheet');
    if (!$sheets) return null;
    foreach ($sheets as $sheet) {
        $name = (string) $sheet->getAttribute('name');
        if (str_starts_with(strtoupper($name), 'CARATULA')) return $name;
    }
    return null;
}

/** @return string[] */
function readStrings(ZipArchive $zip): array
{
    $contents = $zip->getFromName('xl/sharedStrings.xml');
    if ($contents === false) return [];
    $reader = new XMLReader();
    if (!$reader->XML($contents, null, LIBXML_NONET)) throw new RuntimeException('SharedStrings XML invalido.');
    $strings = [];
    while ($reader->read()) {
        if ($reader->nodeType !== XMLReader::ELEMENT || $reader->localName !== 'si') continue;
        $element = $reader->expand();
        if (!$element instanceof DOMElement) throw new RuntimeException('Cadena XLSX invalida.');
        $text = '';
        foreach ($element->getElementsByTagNameNS('*', 't') as $t) $text .= $t->textContent;
        $strings[] = $text;
    }
    $reader->close();
    return $strings;
}

function columnIndex(string $col): int
{
    $value = 0;
    foreach (str_split($col) as $letter) $value = $value * 26 + ord($letter) - 64;
    return $value - 1;
}

/** @return array<int,mixed> Values indexed by zero-based Excel column. */
function parseRow(string $rowXml, array $strings): array
{
    $row = new DOMDocument();
    if (!$row->loadXML($rowXml, LIBXML_NONET)) throw new RuntimeException('Fila Excel invalida.');
    $out = [];
    for ($cell = $row->documentElement->firstChild; $cell !== null; $cell = $cell->nextSibling) {
        if (!$cell instanceof DOMElement || $cell->localName !== 'c') continue;
        $ref = $cell->getAttribute('r');
        if (!preg_match('/^([A-Z]+)[0-9]+$/', $ref, $m)) continue;
        $column = columnIndex($m[1]);
        // Source financial columns are within A:DX. Ignore formatting outside this bound.
        if ($column > 127) continue;
        $type = $cell->getAttribute('t');
        $vals = $cell->getElementsByTagNameNS('*', 'v');
        $raw = $vals->length ? $vals->item(0)->textContent : null;
        if ($type === 'e') throw new RuntimeException('Celda de Excel contiene error.');
        if ($type === 's') {
            if ($raw === null || !array_key_exists((int) $raw, $strings)) throw new RuntimeException('Indice SharedString invalido.');
            $raw = $strings[(int) $raw];
        } elseif ($type === 'inlineStr') {
            $raw = '';
            foreach ($cell->getElementsByTagNameNS('*', 't') as $t) $raw .= $t->textContent;
        }
        $out[$column] = $raw;
    }
    return $out;
}

/** @return Generator<int,array<int,mixed>> */
function streamSheetRows(ZipArchive $zip, string $sheetXml, array $strings): Generator
{
    // Large sheets can contain hundreds of thousands of formatted empty rows.
    // Stream XML to a private temporary file rather than retaining it in PHP memory.
    $input = $zip->getStream($sheetXml);
    if ($input === false) throw new RuntimeException('No se puede leer la hoja Excel.');
    $tmp = tempnam(JJP_PRIVATE_DIR, '.hoja_xml_');
    if (!is_string($tmp)) { fclose($input); throw new RuntimeException('No se pudo crear temporal XML.'); }
    chmod($tmp, 0600);
    $reader = new XMLReader();
    try {
        $output = fopen($tmp, 'wb');
        if ($output === false) throw new RuntimeException('No se pudo abrir temporal XML.');
        try {
            $bytes = stream_copy_to_stream($input, $output, 268435457);
            if ($bytes === false || $bytes > 268435456) throw new RuntimeException('Hoja Excel excede el limite de lectura.');
        } finally { fclose($output); }
        if (!$reader->open($tmp, null, LIBXML_NONET)) throw new RuntimeException('XML de hoja invalido.');
        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') break;
        }
        if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') {
            do {
                $rowNumber = (int) $reader->getAttribute('r');
                $xmlRow = $reader->readOuterXML();
                if ($rowNumber === 1 || str_contains($xmlRow, '<v>') || str_contains($xmlRow, '<is>')) {
                    yield $rowNumber => parseRow($xmlRow, $strings);
                }
            } while ($reader->next('row'));
        }
    } finally {
        $reader->close();
        fclose($input);
        if (is_file($tmp)) unlink($tmp);
    }
}

function indexToLetter(int $column): string
{
    $column++;
    $name = '';
    while ($column > 0) {
        $column--;
        $name = chr(65 + ($column % 26)) . $name;
        $column = intdiv($column, 26);
    }
    return $name;
}

function amountCents($value): int
{
    if (!is_scalar($value) || !is_numeric($value) || !is_finite((float) $value)) {
        throw new RuntimeException('Importe no numerico.');
    }
    if (abs((float) $value) > 1.0e11) throw new RuntimeException('Importe fuera de rango.');
    return (int) round(((float) $value) * 100, 0, PHP_ROUND_HALF_UP);
}

function dateFromExcel($value): string
{
    if ($value === null || $value === '') throw new RuntimeException('Fecha vacia.');
    if (is_numeric($value)) {
        $days = (int) floor((float) $value);
        if ($days < 30000 || $days > 100000) throw new RuntimeException('Fecha serial fuera de rango.');
        return (new DateTimeImmutable('1899-12-30', new DateTimeZone('UTC')))
            ->modify('+' . $days . ' days')->format('Y-m-d');
    }
    if (is_string($value) && preg_match('/^(\d{4})-(\d{2})-\d{2}/', $value, $matches)) {
        return substr($value, 0, 10);
    }
    throw new RuntimeException('Formato de fecha no admitido.');
}

function auditExcel(string $filename, ?string $requiredMonth): array
{
    $zip = new ZipArchive();
    if ($zip->open($filename, ZipArchive::RDONLY) !== true) throw new RuntimeException('No es un XLSX valido.');
    try {
        $strings = readStrings($zip);
        $bankSheets = ['BANAMEX', 'BANREGIO', 'CAJA', 'JDJP', 'CUENTA 18'];
        $count = 0; $total = 0; $invalid = 0; $negative = 0;
        $banks = []; $months = []; $categories = []; $byBankCategory = [];
        $errors = []; $warnings = []; $normalized = []; $sourceHeaders = [];
        foreach ($bankSheets as $bank) {
            $sheetXml = getWorksheetPath($zip, $bank);
            $categoryStart = null; $categoryEnd = null; $commentIndex = null;
            $hasHeader = false;
            foreach (streamSheetRows($zip, $sheetXml, $strings) as $r => $values) {
                if ($r === 1) {
                    $hasHeader = true;
                    foreach ($values as $col => $cellValue) {
                        $header = strtoupper(trim((string) ($cellValue ?? '')));
                        if ($header === 'ENG TS') $categoryStart = $col;
                        if ($header === 'DESTAPES') $categoryEnd = $col;
                        if ($header === 'COMENTARIO') $commentIndex = $col;
                        $sourceHeaders[$bank][$col] = trim((string) ($cellValue ?? ''));
                    }
                    if ($categoryStart === null || $categoryEnd === null || $categoryEnd <= $categoryStart) {
                        throw new RuntimeException('Columnas de categorias inesperadas en ' . $bank);
                    }
                    continue;
                }
                if ($categoryStart === null || $categoryEnd === null) continue;
                for ($col = $categoryStart; $col <= $categoryEnd; $col++) {
                    $raw = $values[$col] ?? null;
                    if ($raw === null || trim((string) $raw) === '') continue;
                    try {
                        // The source column is a financial category, never a subtotal column.
                        $cents = amountCents($raw);
                        if ($cents === 0) continue;
                        $date = dateFromExcel($values[0] ?? null);
                        $month = substr($date, 0, 7);
                        if ($requiredMonth !== null && $month !== $requiredMonth) {
                            throw new RuntimeException('Fecha fuera del mes solicitado.');
                        }
                        $category = (string) ($sourceHeaders[$bank][$col] ?? '');
                        if ($category === '') throw new RuntimeException('Categoria sin encabezado.');
                        $category = trim($category);
                        if ($cents < 0) $negative++;
                        $count++; $total += $cents;
                        $banks[$bank] = ($banks[$bank] ?? 0) + $cents;
                        $months[$month] = ($months[$month] ?? 0) + 1;
                        $categories[$category] = ($categories[$category] ?? 0) + 1;
                        $byBankCategory[$bank][$category] = ($byBankCategory[$bank][$category] ?? 0) + $cents;
                        $ref = trim((string) ($values[5] ?? ''));
                        $comment = $commentIndex === null ? '' : trim((string) ($values[$commentIndex] ?? ''));
                        // Location is unique within a complete monthly workbook snapshot.
                        $key = $month . '|' . $bank . '|' . $r . '|' . indexToLetter($col) . '|' . $ref . '|' . $category;
                        $normalized[] = [
                            'fecha' => $date, 'mes' => $month, 'banco' => $bank,
                            'categoria' => $category, 'subcategoria' => $comment,
                            'referenciaContrato' => $ref, 'importe' => $cents / 100,
                            'fuente' => basename($filename), 'hojaOrigen' => $bank,
                            'filaOrigen' => $r, 'columnaOrigen' => indexToLetter($col),
                            'claveRegistro' => $key,
                        ];
                    } catch (Throwable $error) {
                        $invalid++;
                        if (count($errors) < 12) $errors[] = $bank . '!Fila ' . $r . ' columna ' . indexToLetter($col) . ': ' . $error->getMessage();
                    }
                }
            }
            if (!$hasHeader) throw new RuntimeException('Hoja fuente sin encabezado: ' . $bank);
        }
        $expectedCents = null;
        $coverName = coverSheetName($zip);
        if ($coverName !== null) {
            $coverSheet = getWorksheetPath($zip, $coverName);
            foreach (streamSheetRows($zip, $coverSheet, $strings) as $r => $values) {
                if ($r === 21 && isset($values[3])) $expectedCents = amountCents($values[3]);
                if ($r >= 21) break;
            }
        }
        if ($expectedCents === null) {
            $errors[] = 'No se encontro un total de control en CARATULA!D21.';
        } elseif ($expectedCents !== $total) {
            $errors[] = 'Diferencia contra CARATULA!D21: ' . number_format(($total - $expectedCents) / 100, 2, '.', '');
        }
        if (isset($categories['COBANZA SERVICIO CH'], $categories['COBRANZA SERVICIO CH'])) {
            $warnings[] = 'Categorias COBANZA/COBRANZA SERVICIO CH distintas en origen';
        }
        if ($negative > 0) $warnings[] = 'Contiene ' . $negative . ' importes negativos en categorias.';
        ksort($banks); ksort($months); ksort($categories);
        foreach ($byBankCategory as &$perBank) ksort($perBank);
        unset($perBank);
        ksort($byBankCategory);
        return [
            'validado' => $count > 0 && $invalid === 0 && !$errors,
            'fuente' => 'HOJAS_ORIGINALES', 'hojas' => $bankSheets,
            'registros' => $count,
            'total' => number_format($total / 100, 2, '.', ''),
            'totalCaratula' => $expectedCents !== null ? number_format($expectedCents / 100, 2, '.', '') : null,
            'hojaCaratula' => $coverName,
            'porBanco' => array_map(static fn(int $v): string => number_format($v / 100, 2, '.', ''), $banks),
            'porMes' => $months, 'categorias' => $categories,
            'porBancoCategoria' => array_map(static fn(array $byCat): array => array_map(
                static fn(int $v): string => number_format($v / 100, 2, '.', ''), $byCat
            ), $byBankCategory),
            'filasInvalidas' => $invalid, 'importesNegativos' => $negative,
            'errores' => $errors, 'advertencias' => $warnings,
            '_datosPrivados' => $normalized,
        ];
    } finally {
        $zip->close();
    }
}

function httpJson(string $url, array $headers = [], ?string $body = null): array
{
    $curl = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 35, CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($body !== null) {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $body;
    }
    curl_setopt_array($curl, $options);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('HTTP ' . $status . ' al consultar Microsoft 365.');
    }
    $data = json_decode($response, true);
    if (!is_array($data)) throw new RuntimeException('Respuesta JSON invalida de Microsoft 365.');
    return $data;
}


/** Only Portal Interno JJP app credentials. Never fallback to Solicitud Venta. */
function ingresosGraphToken(): string
{
    if (!function_exists('portal_graph_app_token')) {
        throw new RuntimeException('El cliente Graph del Portal no esta disponible.');
    }
    $cfg = $GLOBALS['config'] ?? null;
    if (!is_array($cfg)) throw new RuntimeException('Configuracion del portal no disponible.');
    $fields = [
        'tenantId' => trim((string) ($cfg['tenant_id'] ?? '')),
        'clientId' => trim((string) ($cfg['client_id'] ?? '')),
        'clientSecret' => trim((string) ($cfg['client_secret'] ?? '')),
    ];
    if ($fields['tenantId'] === '' || $fields['clientId'] === '' || $fields['clientSecret'] === '') {
        throw new RuntimeException('Configuracion del Portal incompleta.');
    }
    if (strtolower($fields['clientId']) !== JJP_PORTAL_CLIENT_ID) {
        throw new RuntimeException('La aplicacion configurada no es Portal Interno JJP.');
    }
    return portal_graph_app_token($fields);
}

/** Download a single original Excel into a random private temporary file. */
function ingresosDownloadTemporal(string $month): array
{
    if (!preg_match('/^20\d\d-(0[1-9]|1[0-2])$/D', $month)) {
        throw new RuntimeException('Mes no valido.');
    }
    $monthNames = [1=>'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                   'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    $year = substr($month, 0, 4);
    $number = (int) substr($month, 5, 2);
    $file = $monthNames[$number] . ' ' . $year . '.xlsx';
    $path = implode('/', array_map('rawurlencode', ['2. Reportes', $year, $file]));
    $token = ingresosGraphToken();
    $baseUrl = 'https://graph.microsoft.com/v1.0/drives/' . JJP_COBRANZA_DRIVE_ID . '/root:/' . $path . ':';
    $meta = httpJson($baseUrl, ['Authorization: Bearer ' . $token, 'Accept: application/json']);
    if (($meta['name'] ?? null) !== $file) throw new RuntimeException('Archivo inesperado en Graph.');
    $size = (int) ($meta['size'] ?? 0);
    if ($size < 1 || $size > JJP_MAX_XLSX_BYTES) throw new RuntimeException('Tamano de Excel no permitido.');
    $id = trim((string) ($meta['id'] ?? ''));
    if ($id === '') throw new RuntimeException('Microsoft Graph no devolvio el identificador de Excel.');
    $url = (string) ($meta['@microsoft.graph.downloadUrl'] ?? '');
    if ($url === '') {
        $item = httpJson('https://graph.microsoft.com/v1.0/drives/' . JJP_COBRANZA_DRIVE_ID . '/items/' . rawurlencode($id),
            ['Authorization: Bearer ' . $token, 'Accept: application/json']);
        $url = (string) ($item['@microsoft.graph.downloadUrl'] ?? '');
    }
    if (!str_starts_with($url, 'https://')) throw new RuntimeException('Graph no devolvio descarga HTTPS.');
    if (!is_dir(JJP_PRIVATE_DIR) || !is_writable(JJP_PRIVATE_DIR)) {
        throw new RuntimeException('Carpeta privada no disponible.');
    }
    $tmp = tempnam(JJP_PRIVATE_DIR, 'excel_test_');
    if ($tmp === false) throw new RuntimeException('No se pudo crear archivo temporal privado.');
    chmod($tmp, 0600);
    $fh = fopen($tmp, 'wb');
    if ($fh === false) {
        @unlink($tmp);
        throw new RuntimeException('No fue posible abrir temporal.');
    }
    try {
        $curl = curl_init($url);
        if ($curl === false) throw new RuntimeException('No se pudo inicializar descarga.');
        curl_setopt_array($curl, [
            CURLOPT_FILE => $fh,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        $ok = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        fflush($fh);
        clearstatcache(true, $tmp);
        $received = filesize($tmp);
        if ($ok === false || $status !== 200 || $received === false || $received !== $size) {
            throw new RuntimeException('Descarga incompleta o HTTP distinto de 200.');
        }
        return [
            'temporal' => $tmp, 'nombre' => $file,
            'tamanoBytes' => $received,
            'etagDisponible' => !empty($meta['eTag']),
            'modificado' => (string) ($meta['lastModifiedDateTime'] ?? ''),
        ];
    } catch (Throwable $e) {
        @unlink($tmp);
        throw $e;
    } finally {
        fclose($fh);
    }
}

/** Audit without writing caches. Ensures downloaded temporary workbook is deleted. */
function ingresosAuditarDesdeGraph(string $mes): array
{
    $file = ingresosDownloadTemporal($mes);
    $path = $file['temporal'];
    try {
        $audit = auditExcel($path, $mes);
        // Never return customer/contract-level records to the browser.
        unset($audit['_datosPrivados']);
        return [
            'modo' => 'solo_lectura_hojas_originales',
            'archivo' => $file['nombre'],
            'mes' => $mes,
            'tamanoBytes' => $file['tamanoBytes'],
            'etagDisponible' => $file['etagDisponible'],
            'fechaModificacion' => $file['modificado'],
            'auditoria' => $audit,
            'sharepointModificado' => false,
            'cachePublicada' => false,
            'excelTemporalEliminado' => true,
        ];
    } finally {
        if (is_file($path)) @unlink($path);
    }
}
