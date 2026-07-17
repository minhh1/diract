// components/pdfeditor/SignaturePad.tsx
// Small modal: draw a signature with the mouse/touch, export it as a transparent
// PNG data URL. The caller then places it on the page (click-to-place, see
// PdfEditor's "signature" tool handling in PdfPageView).
"use client";

import { useRef, useState } from "react";
import { X, RotateCcw } from "lucide-react";

interface Props {
  onDone: (pngDataUrl: string) => void;
  onCancel: () => void;
}

export default function SignaturePad({ onDone, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = getPos(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
    setHasDrawn(true);
  };

  const end = () => { drawing.current = false; last.current = null; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const done = () => {
    if (!hasDrawn) return;
    onDone(canvasRef.current!.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Draw your signature</h3>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={400}
          height={160}
          className="w-full border border-slate-200 rounded-xl bg-slate-50 touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={clear}
            className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-800"
          >
            <RotateCcw size={13} /> Clear
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-[12px] font-medium text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={done}
              disabled={!hasDrawn}
              className="px-4 py-2 text-[12px] font-medium bg-slate-900 text-white rounded-full disabled:opacity-40"
            >
              Use signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
