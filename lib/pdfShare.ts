import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Convert a Blob to a base64 string (without the data: prefix)
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Save a PDF blob and open the native share sheet (iOS share sheet includes
// Print, Save to Files, AirDrop, etc.). This is the reliable path for the
// native app — the WebView blocks window.open, window.print, downloads, and
// blob: URLs in iframes.
export async function sharePdfNative(blob: Blob, filename: string): Promise<void> {
  const base64 = await blobToBase64(blob)
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })
  await Share.share({
    title: filename,
    url: result.uri,
    dialogTitle: 'Share earnings report',
  })
}

// Open a PDF blob on the web: new tab, falling back to a download link.
export function openPdfWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank')
  if (!opened) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// Unified entry point: native share sheet on the app, new tab/download on web.
export async function presentPdf(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await sharePdfNative(blob, filename)
  } else {
    openPdfWeb(blob, filename)
  }
}
