# Render the editable panel.svg geometry to Chrome-compatible PNGs.
Add-Type -AssemblyName System.Drawing

function New-RoundedRectangle([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = 2 * $radius
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
  $path.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

foreach ($size in @(16, 32, 48, 128)) {
  $canvas = New-Object System.Drawing.Bitmap(512, 512)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform(4, 4)
  $background = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#742F14'))
  $accent = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFF7ED'))
  $tile = New-RoundedRectangle 1 1 126 126 28
  $cursor = New-RoundedRectangle 68 85 41 13 6.5
  $graphics.FillPath($background, $tile)
  $graphics.FillPath($accent, $cursor)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#FFF7ED'), 13)
  $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($pen, [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(23,33), [System.Drawing.PointF]::new(54,64), [System.Drawing.PointF]::new(23,95)))
  $output = New-Object System.Drawing.Bitmap($size, $size)
  $resizer = [System.Drawing.Graphics]::FromImage($output)
  $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizer.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $resizer.DrawImage($canvas, 0, 0, $size, $size)
  $output.Save((Join-Path $PSScriptRoot "panel-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $resizer.Dispose()
  $output.Dispose()
  $pen.Dispose()
  $cursor.Dispose()
  $tile.Dispose()
  $accent.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
}
