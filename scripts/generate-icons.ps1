Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'icons'
foreach ($entry in @(@('icon-192.png',192),@('icon-512.png',512),@('maskable-512.png',512),@('apple-touch-icon.png',180))) {
    $dimension = [int]$entry[1]
    $bitmap = [System.Drawing.Bitmap]::new($dimension,$dimension)
    $drawing = [System.Drawing.Graphics]::FromImage($bitmap)
    $drawing.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $drawing.Clear([System.Drawing.ColorTranslator]::FromHtml('#0f180f'))
    $drawing.ScaleTransform(($dimension/512),($dimension/512))
    $accentColor = [System.Drawing.ColorTranslator]::FromHtml('#a6f033')
    $pen = [System.Drawing.Pen]::new($accentColor,22)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $brush = [System.Drawing.SolidBrush]::new($accentColor)
    $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(30,$accentColor),2)
    $drawing.DrawEllipse($ringPen,70,70,372,372)
    $drawing.DrawArc($pen,143,135,226,226,180,180)
    $drawing.DrawLine($pen,143,248,143,288)
    $drawing.DrawLine($pen,369,248,369,288)
    $drawing.FillRectangle($brush,135,287,57,62)
    $drawing.FillEllipse($brush,135,268,57,40)
    $drawing.FillEllipse($brush,135,328,57,40)
    $drawing.FillRectangle($brush,320,287,57,62)
    $drawing.FillEllipse($brush,320,268,57,40)
    $drawing.FillEllipse($brush,320,328,57,40)
    $barPen = [System.Drawing.Pen]::new($accentColor,12)
    $barPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $barPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $drawing.DrawLine($barPen,225,267,225,315)
    $drawing.DrawLine($barPen,256,243,256,339)
    $drawing.DrawLine($barPen,287,267,287,315)
    $bitmap.Save((Join-Path $iconDirectory $entry[0]),[System.Drawing.Imaging.ImageFormat]::Png)
    $barPen.Dispose(); $ringPen.Dispose(); $brush.Dispose(); $pen.Dispose(); $drawing.Dispose(); $bitmap.Dispose()
}
