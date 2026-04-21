param([Parameter(Mandatory=$true)][string]$FilePath)
if (-not (Test-Path -LiteralPath $FilePath)) { exit 0 }
$ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
try {
    $content = [System.IO.File]::ReadAllText($FilePath)
    if ($ext -eq '.ps1') {
        [System.IO.File]::WriteAllText($FilePath, $content, [System.Text.UTF8Encoding]::new($true))
    } elseif ($ext -eq '.bat') {
        [System.IO.File]::WriteAllText($FilePath, $content, [System.Text.Encoding]::GetEncoding(932))
    }
} catch {
    exit 0
}
