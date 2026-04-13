# PowerShell 5.1/7 両対応でエンコーディングを修正するスクリプト

# PowerShellスクリプト (.ps1) を UTF-8 with BOM に変換
$psFiles = Get-ChildItem -Filter *.ps1 -Recurse
foreach ($file in $psFiles) {
    if ($file.Name -eq "fix.ps1") { continue }
    Write-Host "Converting PS script: $($file.Name) -> UTF-8 with BOM"
    # UTF-8 で読み込み
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.UTF8Encoding]::new($true))
}

# バッチファイル (.bat) を Shift-JIS に変換
$batFiles = Get-ChildItem -Filter *.bat -Recurse
$sjis = [System.Text.Encoding]::GetEncoding(932)
foreach ($file in $batFiles) {
    Write-Host "Converting Batch file: $($file.Name) -> Shift-JIS"
    # 現在 UTF-8 で書かれているはずなので UTF-8 で読み込む
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($file.FullName, $content, $sjis)
}

Write-Host "`nSuccessfully converted all files to their optimal encodings."
