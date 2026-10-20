# Gera assets\icon.png (256x256): quadrado arredondado com o degradê do app e um visor de captura.
Add-Type -AssemblyName System.Drawing

$size = 256
$out = Join-Path $PSScriptRoot '..\assets\icon.png'
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null

$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Fundo arredondado
$r = 60
$p = New-Object System.Drawing.Drawing2D.GraphicsPath
$p.AddArc(0, 0, $r, $r, 180, 90)
$p.AddArc($size - $r - 1, 0, $r, $r, 270, 90)
$p.AddArc($size - $r - 1, $size - $r - 1, $r, $r, 0, 90)
$p.AddArc(0, $size - $r - 1, $r, $r, 90, 90)
$p.CloseFigure()

$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new($size, $size)), ([System.Drawing.Color]::Black), ([System.Drawing.Color]::Black)
$blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
$blend.Colors = @([System.Drawing.ColorTranslator]::FromHtml('#ef4444'), [System.Drawing.ColorTranslator]::FromHtml('#f43f5e'), [System.Drawing.ColorTranslator]::FromHtml('#f59e0b'))
$blend.Positions = @(0.0, 0.55, 1.0)
$brush.InterpolationColors = $blend
$g.FillPath($brush, $p)

# Cantos do visor
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 18
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$a = 62; $b = $size - 62; $l = 46
foreach ($c in @(@($a, $a, 1, 1), @($b, $a, -1, 1), @($b, $b, -1, -1), @($a, $b, 1, -1))) {
  $x = $c[0]; $y = $c[1]; $dx = $c[2]; $dy = $c[3]
  $g.DrawLines($pen, [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new($x, $y + $dy * $l),
    [System.Drawing.Point]::new($x, $y),
    [System.Drawing.Point]::new($x + $dx * $l, $y)))
}

# Seta no meio
$arrow = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 16
$arrow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLine($arrow, 104, 152, 150, 106)
$g.DrawLines($arrow, [System.Drawing.Point[]]@([System.Drawing.Point]::new(118, 104), [System.Drawing.Point]::new(152, 104), [System.Drawing.Point]::new(152, 138)))

$bmp.Save((Resolve-Path (Split-Path $out)).Path + '\icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Icone criado: $out"
