# Auxiliar de captura: fica aberto e, a cada linha recebida, fotografa todos os monitores em resolução real.
# Responde uma linha JSON: {"ok":true,"shots":[{"x":0,"y":0,"w":1920,"h":1080,"file":"...bmp"}]}
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Namespace StylleScreen -Name Dpi -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr value);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
# Sem isto o Windows entrega a tela reduzida quando a escala está em 125%, 150%...
try { [void][StylleScreen.Dpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch { [void][StylleScreen.Dpi]::SetProcessDPIAware() }

$dir = $env:STYLLE_CAPDIR
[void](New-Item -ItemType Directory -Force $dir)
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()

while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $shots = New-Object System.Collections.ArrayList
    $i = 0
    foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
      $b = $s.Bounds
      $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
      $g.Dispose()
      $file = Join-Path $dir "screen_$i.bmp"
      $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Bmp)
      $bmp.Dispose()
      [void]$shots.Add(@{ x = $b.X; y = $b.Y; w = $b.Width; h = $b.Height; file = $file })
      $i++
    }
    $json = ConvertTo-Json -Compress -Depth 4 @{ ok = $true; shots = $shots.ToArray() }
  } catch {
    $json = ConvertTo-Json -Compress @{ ok = $false; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
