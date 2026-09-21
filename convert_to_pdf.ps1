$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $docxPath = Join-Path (Get-Location) "myHR_by_Swaniki_README.docx"
    $pdfPath = Join-Path (Get-Location) "myHR_by_Swaniki_README.pdf"
    $doc = $word.Documents.Open($docxPath)
    $doc.ExportAsFixedFormat($pdfPath, 17) # 17 = wdExportFormatPDF
    $doc.Close([Microsoft.Office.Interop.Word.WdSaveOptions]::wdDoNotSaveChanges)
    Write-Host "PDF export successful: $pdfPath"
} catch {
    Write-Error $_.Exception.Message
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
