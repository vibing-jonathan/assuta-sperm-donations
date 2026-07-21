import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

import type { Donor } from '../features/donors/donor'
import type { DonorMediaRepository } from '../features/donors/mediaRepository'
import { Icon } from './Icon'
import { ScreenHeader } from './ScreenHeader'

interface PdfViewerProps {
  donor: Donor
  mediaRepository: DonorMediaRepository
  onBack: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

export function PdfViewer({ donor, mediaRepository, onBack }: PdfViewerProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [rendering, setRendering] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [stageSizeVersion, setStageSizeVersion] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | null = null
    let objectUrl: string | null = null
    setLoadState('loading')
    setPdf(null)
    setPageNumber(1)

    void (async () => {
      try {
        const blob = await mediaRepository.getDetailPdf(donor.donorNumber)
        objectUrl = URL.createObjectURL(blob)
        // The legacy build includes the Promise/Uint8Array polyfills that PDF.js 6
        // needs on Android browsers that have not implemented the 2025 APIs yet.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
          // Some Android font engines misplace glyphs from this catalog's
          // embedded Hebrew fonts. Drawing glyph outlines is slower but keeps
          // the original page typography intact across mobile browsers.
          disableFontFace: true,
          useSystemFonts: false,
        })
        const loadedPdf = await loadingTask.promise
        if (!active) return
        setPdfUrl(objectUrl)
        setPdf(loadedPdf)
        setLoadState('ready')
      } catch {
        if (active) setLoadState('error')
      }
    })()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (loadingTask) void loadingTask.destroy()
    }
  }, [donor.donorNumber, loadAttempt, mediaRepository])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setStageSizeVersion((value) => value + 1))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [loadState])

  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let active = true
    let renderTask: RenderTask | null = null
    setRendering(true)
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (!active || !canvasRef.current) return
        const initialViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(180, (stageRef.current?.clientWidth ?? 390) - 24)
        const availableHeight = Math.max(80, (stageRef.current?.clientHeight ?? 560) - 24)
        const fitScale = Math.min(
          availableWidth / initialViewport.width,
          availableHeight / initialViewport.height,
        )
        const scale = fitScale * (zoom / 100)
        const viewport = page.getViewport({ scale })
        const zoomRatio = zoom / 100
        const preferredPixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3)
        const pixelRatio = Math.max(1, Math.min(preferredPixelRatio, 3 / zoomRatio))
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable.')
        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        })
        await renderTask.promise
        if (stageRef.current) {
          stageRef.current.scrollLeft = Math.max(0, (stageRef.current.scrollWidth - stageRef.current.clientWidth) / 2)
          stageRef.current.scrollTop = Math.max(0, (stageRef.current.scrollHeight - stageRef.current.clientHeight) / 2)
        }
      } catch (error) {
        if ((error as { name?: string }).name !== 'RenderingCancelledException' && active) setLoadState('error')
      } finally {
        if (active) setRendering(false)
      }
    })()
    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [pageNumber, pdf, stageSizeVersion, zoom])

  return (
    <main className="app-shell pdf-shell" dir="rtl">
      <section className="screen pdf-screen">
        <ScreenHeader
          title={pdf ? `עמוד ${pageNumber} מתוך ${pdf.numPages}` : 'פרטי תורם מלאים'}
          onBack={onBack}
          dark
          action={pdfUrl
            ? <a className="icon-button" href={pdfUrl} target="_blank" rel="noreferrer" aria-label="פתיחת הקובץ בחלון חדש"><Icon name="open" /></a>
            : undefined}
        />
        {loadState === 'loading' && (
          <div className="pdf-state" role="status">
            <span className="spinner" />
            <strong>טוענות את המסמך המקורי…</strong>
            <p>הקובץ המאובטח נטען ישירות ממאגר התורמים.</p>
          </div>
        )}
        {loadState === 'error' && (
          <div className="pdf-state" role="alert">
            <span className="pdf-state-icon"><Icon name="document" /></span>
            <strong>לא הצלחנו לטעון את המסמך</strong>
            <p>ייתכן שהקובץ אינו זמין כרגע. נסי שוב בעוד רגע.</p>
            <button className="button button-light" type="button" onClick={() => setLoadAttempt((value) => value + 1)}><Icon name="refresh" /> ניסיון נוסף</button>
          </div>
        )}
        {loadState === 'ready' && pdf && (
          <div className="pdf-content">
            <div className="pdf-toolbar" aria-label="כלי תצוגת מסמך">
              <div className="tool-group">
                <button type="button" onClick={() => setZoom((value) => Math.min(250, value + 25))} disabled={zoom === 250} aria-label="הגדלה"><Icon name="plus" /></button>
                <span dir="ltr">{zoom}%</span>
                <button type="button" onClick={() => setZoom((value) => Math.max(100, value - 25))} disabled={zoom === 100} aria-label="הקטנה"><Icon name="minus" /></button>
              </div>
              {pdfUrl && <a className="pdf-download" href={pdfUrl} download={`donor-${donor.donorNumber}.pdf`}><Icon name="download" /> הורדה</a>}
            </div>
            <div className="document-stage" ref={stageRef} aria-busy={rendering}>
              {rendering && <span className="canvas-spinner spinner" aria-label="העמוד נטען" />}
              <canvas ref={canvasRef} aria-label={`עמוד ${pageNumber} מתוך ${pdf.numPages}`} />
            </div>
            <nav className="page-navigation" aria-label="ניווט בין עמודי המסמך">
              <button type="button" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber === 1}><Icon name="arrow" /> הקודם</button>
              <span><strong>{pageNumber}</strong> / {pdf.numPages}</span>
              <button type="button" onClick={() => setPageNumber((value) => Math.min(pdf.numPages, value + 1))} disabled={pageNumber === pdf.numPages}>הבא <Icon name="arrow" /></button>
            </nav>
          </div>
        )}
      </section>
    </main>
  )
}
