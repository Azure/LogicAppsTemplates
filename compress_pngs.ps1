$folder = "."
$pngFiles = Get-ChildItem -Path $folder -Recurse -Filter *.png

foreach ($file in $pngFiles) {
	$webpFile = [System.IO.Path]::ChangeExtension($file.FullName, "webp")
	
	# Convert PNG to WebP with compression. Adjust the -compression_level (0-6) and quality (0-100).
	ffmpeg -i $file.FullName -compression_level 6 -qscale 75 $webpFile
	
	# Optional: Remove original PNG after conversion
	Remove-Item $file.FullName
}