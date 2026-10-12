$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = Get-Content -LiteralPath $env:ASECHKA_IMAGE_REQUEST -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if ($request.mode -eq 'pick') {
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title = 'Pick your pictures for Asechka'
    $picker.Filter = 'Pictures (*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff)|*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff'
    $picker.Multiselect = $true
    $picker.CheckFileExists = $true
    try {
        if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            ConvertTo-Json -InputObject @($picker.FileNames) -Compress
        } else { '[]' }
    } finally { $picker.Dispose() }
    exit
}

if ($request.mode -ne 'resize') { throw 'Unknown image task.' }
$source = $null
$bitmap = $null
$graphics = $null
$parameters = $null
try {
    $source = [System.Drawing.Image]::FromFile($request.source)
    if ($source.PropertyIdList -contains 274) {
        $orientation = [BitConverter]::ToUInt16($source.GetPropertyItem(274).Value, 0)
        $rotation = switch ($orientation) {
            2 { [System.Drawing.RotateFlipType]::RotateNoneFlipX }
            3 { [System.Drawing.RotateFlipType]::Rotate180FlipNone }
            4 { [System.Drawing.RotateFlipType]::Rotate180FlipX }
            5 { [System.Drawing.RotateFlipType]::Rotate90FlipX }
            6 { [System.Drawing.RotateFlipType]::Rotate90FlipNone }
            7 { [System.Drawing.RotateFlipType]::Rotate270FlipX }
            8 { [System.Drawing.RotateFlipType]::Rotate270FlipNone }
            default { [System.Drawing.RotateFlipType]::RotateNoneFlipNone }
        }
        $source.RotateFlip($rotation)
    }
    $scale = [Math]::Min([double]1, [double](1800.0 / [Math]::Max($source.Width, $source.Height)))
    $width = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
    $bitmap = New-Object System.Drawing.Bitmap($width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb))
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source, 0, 0, $width, $height)
    $graphics.Dispose()
    $graphics = $null
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    foreach ($quality in @(85, 78, 70, 62, 55, 45)) {
        $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
        $bitmap.Save($request.destination, $codec, $parameters)
        $parameters.Dispose()
        $parameters = $null
        if ((Get-Item -LiteralPath $request.destination).Length -le 1MB) { break }
    }
    if ((Get-Item -LiteralPath $request.destination).Length -gt 1MB) { throw 'Could not make this photo small enough. Try a smaller JPG.' }
    # Drawing into a fresh bitmap strips EXIF data, including location. Originals are untouched.
    ConvertTo-Json -InputObject @{ width = $width; height = $height; bytes = (Get-Item -LiteralPath $request.destination).Length } -Compress
} finally {
    if ($graphics) { $graphics.Dispose() }
    if ($parameters) { $parameters.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    if ($source) { $source.Dispose() }
}
