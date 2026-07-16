import { imageCanvas } from "./dom.js?v=80";
import { state } from "./state.js?v=80";
import { setStatus } from "./ui.js";

function sanitizeFileName(name) {
  return String(name || "imagem")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "_");
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}

function fitInside(sourceWidth, sourceHeight, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale
  };
}

function boxLabel(box, index) {
  const prefix = box.source === "fft" ? "FFT" : box.source === "manual" ? "Manual" : "BB";
  const displayedName = `${prefix} ${index + 1}`;
  const percentage = box.source === "manual" ? null : Number.isFinite(box.suspicionPercent)
    ? box.suspicionPercent
    : 0;

  return {
    title: displayedName,
    percentage,
    comment: box.source === "manual"
      ? `${displayedName}: região definida manualmente pelo usuário.`
      : `Percentual de suspeita de ${displayedName}: ${percentage}%. Este percentual é calculado a partir do score normalizado produzido pelo algoritmo responsável por esta região.`
  };
}

function ensurePageSpace(doc, y, requiredHeight, margin) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + requiredHeight <= pageHeight - margin) return y;
  doc.addPage();
  return margin;
}

export async function generateCurrentAnalysisReport() {
  if (!state.currentImageData || !state.suspectBoxes) {
    setStatus("Execute primeiro a detecção de regiões suspeitas.");
    return;
  }

  const jsPDFClass = window.jspdf?.jsPDF;
  if (!jsPDFClass) {
    setStatus("Não foi possível carregar o gerador de PDF. Verifique a conexão com a internet.");
    return;
  }

  try {
    setStatus("Gerando o relatório PDF...");

    const doc = new jsPDFClass({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const margin = 12;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const generatedAt = new Date();
    const boxes = [...state.suspectBoxes];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("SmartScanCargo — Relatório de Regiões Suspeitas", margin, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Imagem X-RAY: ${state.currentFileName || "não identificada"}`, margin, 22);
    doc.text(`Data e hora: ${formatDateTime(generatedAt)}`, margin, 27);
    doc.text(`Quantidade de bounding boxes: ${boxes.length}`, margin, 32);

    const imageDataUrl = imageCanvas.toDataURL("image/jpeg", 0.92);
    const imageBox = fitInside(
      imageCanvas.width,
      imageCanvas.height,
      pageWidth - 2 * margin,
      pageHeight - 50
    );
    const imageX = (pageWidth - imageBox.width) / 2;
    const imageY = 38;
    doc.addImage(imageDataUrl, "JPEG", imageX, imageY, imageBox.width, imageBox.height, undefined, "FAST");

    doc.addPage();
    let y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Comentários por bounding box", margin, y);
    y += 9;

    if (boxes.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Nenhuma região suspeita foi detectada na análise atual.", margin, y);
    } else {
      boxes.forEach((box, index) => {
        const item = boxLabel(box, index);
        y = ensurePageSpace(doc, y, 31, margin);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(item.title, margin, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);

        const lines = doc.splitTextToSize(item.comment, pageWidth - 2 * margin);
        doc.text(lines, margin, y);
        y += lines.length * 4.5 + 7;

        doc.setDrawColor(210, 215, 222);
        doc.line(margin, y - 3, pageWidth - margin, y - 3);
      });
    }

    const outputName = `Relatorio_SmartScanCargo_${sanitizeFileName(state.currentFileName)}.pdf`;
    doc.save(outputName);
    setStatus(`Relatório gerado: ${outputName}`);
  } catch (error) {
    console.error(error);
    setStatus(`Não foi possível gerar o relatório: ${error.message}`);
  }
}
