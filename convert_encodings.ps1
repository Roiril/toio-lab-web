# すべての PowerShell スクリプトを UTF-8 with BOM に変換し、
# バッチファイルを Shift-JIS に変換するスクリプト

$rootPath = $PSScriptRoot
if ([string]::IsNullOrEmpty($rootPath)) { $rootPath = "." }

Write-Host "--- エンコーディング統一処理を開始します ---" -ForegroundColor Cyan

# .ps1 ファイルの処理 (UTF-8 with BOM)
$psFiles = Get-ChildItem -Path $rootPath -Filter *.ps1 -Recurse
foreach ($file in $psFiles) {
    if ($file.Name -eq "convert_encodings.ps1") { continue } # 自分自身は飛ばす
    try {
        Write-Host "Converting PS1: $($file.FullName) -> UTF-8 with BOM" -ForegroundColor Gray
        $content = [System.IO.File]::ReadAllText($file.FullName)
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.UTF8Encoding]::new($true))
    } catch {
        Write-Warning "Failed to convert $($file.Name): $($_.Exception.Message)"
    }
}

# .bat ファイルの処理 (Shift-JIS / CP932)
$batFiles = Get-ChildItem -Path $rootPath -Filter *.bat -Recurse
$sjis = [System.Text.Encoding]::GetEncoding(932)
foreach ($file in $batFiles) {
    try {
        Write-Host "Converting BAT: $($file.FullName) -> Shift-JIS" -ForegroundColor Gray
        # BATファイルは通常 ASCII/Shift-JIS で書かれていることが多いが、
        # もし UTF-8 で書かれている場合を考慮して読み込む
        $content = [System.IO.File]::ReadAllText($file.FullName)
        [System.IO.File]::WriteAllText($file.FullName, $content, $sjis)
    } catch {
        Write-Warning "Failed to convert $($file.Name): $($_.Exception.Message)"
    }
}

Write-Host "--- 処理が完了しました ---" -ForegroundColor Green
