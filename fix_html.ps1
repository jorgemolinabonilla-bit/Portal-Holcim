$filePath = 'c:\Users\jorge\OneDrive\Desktop\CONTROLES HOLCIM NUEVO\index.html'
$lines = [System.IO.File]::ReadAllLines($filePath, [System.Text.Encoding]::UTF8)
Write-Host "Total lines before:" $lines.Length
# Keep lines 0-1465 and 1588 onwards (skipping the orphaned old CCTV block at 1466-1587)
$newLines = $lines[0..1465] + $lines[1588..($lines.Length - 1)]
Write-Host "Total lines after:" $newLines.Length
[System.IO.File]::WriteAllLines($filePath, $newLines, [System.Text.Encoding]::UTF8)
Write-Host "Done!"
