from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps
from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "MIDGAS_Visual_Style_OneSheet_v0.1.pdf"
REGULAR = ROOT / "assets" / "fonts" / "PTMono-Regular.ttf"
BOLD = ROOT / "assets" / "fonts" / "PTMono-Bold.ttf"
CLIENT_SOURCE = ROOT / "midgas" / "A5 - 25.pdf"

PAPER = HexColor("#FFFFFF")
SURFACE = HexColor("#FFFFFF")
INK = HexColor("#000000")
MUTED = HexColor("#5C5C5C")
GRID = HexColor("#D8D8D8")
SIGNAL = INK

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def setup_fonts() -> None:
    pdfmetrics.registerFont(TTFont("PTM", str(REGULAR)))
    pdfmetrics.registerFont(TTFont("PTM-Bold", str(BOLD)))


def background(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def header(c: canvas.Canvas, section: str, page: int, total: int = 1) -> None:
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 8)
    c.drawString(MARGIN, PAGE_H - 14 * mm, "THE MIDGAS")
    c.setFont("PTM", 7)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 14 * mm, f"{section} / V0.1")
    c.setStrokeColor(GRID)
    c.setLineWidth(0.7)
    c.line(MARGIN, PAGE_H - 19 * mm, PAGE_W - MARGIN, PAGE_H - 19 * mm)
    c.setFont("PTM", 6.5)
    c.drawString(MARGIN, 11 * mm, "VISUAL SYSTEM / 11.07.2026")
    c.drawRightString(PAGE_W - MARGIN, 11 * mm, f"{page:02d} / {total:02d}")


def label(c: canvas.Canvas, text: str, x: float, y: float, color=MUTED) -> None:
    c.setFillColor(color)
    c.setFont("PTM-Bold", 6.8)
    c.drawString(x, y, text.upper())


def paragraph(c: canvas.Canvas, text: str, x: float, y_top: float, width: float, size=9, leading=13, color=INK, bold=False) -> float:
    style = ParagraphStyle(
        name="p",
        fontName="PTM-Bold" if bold else "PTM",
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=TA_LEFT,
    )
    item = Paragraph(text, style)
    _, height = item.wrap(width, PAGE_H)
    item.drawOn(c, x, y_top - height)
    return y_top - height


def rule(c: canvas.Canvas, y: float, color=GRID, width=0.7) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(MARGIN, y, PAGE_W - MARGIN, y)


def square_tag(c: canvas.Canvas, text: str, x: float, y: float, accent=False) -> float:
    font_size = 7
    pad_x = 3 * mm
    h = 7 * mm
    text_w = pdfmetrics.stringWidth(text, "PTM-Bold", font_size)
    w = text_w + pad_x * 2
    c.setFillColor(SURFACE)
    c.setStrokeColor(SIGNAL if accent else GRID)
    c.setLineWidth(1.1 if accent else 0.7)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", font_size)
    c.drawCentredString(x + w / 2, y + 2.25 * mm, text)
    return x + w + 2 * mm


def field(c: canvas.Canvas, key: str, value: str, x: float, y: float, width: float) -> None:
    label(c, key, x, y)
    paragraph(c, value, x, y - 3.5 * mm, width, size=8.5, leading=11, bold=True)


def client_photo() -> ImageReader:
    page = PdfReader(str(CLIENT_SOURCE)).pages[0]
    images = [entry.image for entry in page.images]
    photo = max(images, key=lambda image: image.width * image.height).convert("RGB")
    photo = ImageOps.fit(photo, (700, 820), method=Image.Resampling.LANCZOS, centering=(0.5, 0.42))
    buffer = BytesIO()
    photo.save(buffer, format="JPEG", quality=92)
    buffer.seek(0)
    return ImageReader(buffer)


def page_cover(c: canvas.Canvas) -> None:
    background(c)
    header(c, "FOUNDATION", 1)

    c.setFillColor(SIGNAL)
    c.rect(MARGIN, PAGE_H - 121 * mm, 4 * mm, 78 * mm, fill=1, stroke=0)

    c.setFillColor(INK)
    c.setFont("PTM-Bold", 43)
    c.drawString(MARGIN + 12 * mm, PAGE_H - 58 * mm, "THE")
    c.drawString(MARGIN + 12 * mm, PAGE_H - 76 * mm, "MIDGAS")
    c.setFont("PTM", 11)
    c.setFillColor(MUTED)
    c.drawString(MARGIN + 12 * mm, PAGE_H - 87 * mm, "VISUAL SYSTEM / WORKING FOUNDATION")

    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    c.rect(MARGIN + 12 * mm, PAGE_H - 119 * mm, 105 * mm, 20 * mm, fill=0, stroke=1)
    paragraph(
        c,
        "СТРОГАЯ ИНФОРМАЦИОННАЯ СИСТЕМА ДЛЯ КЛИЕНТОВ, АНОМАЛИЙ И СВЯЗАННЫХ МАТЕРИАЛОВ.",
        MARGIN + 17 * mm,
        PAGE_H - 105 * mm,
        95 * mm,
        size=8.5,
        leading=11.5,
        bold=True,
    )

    rule(c, PAGE_H - 143 * mm, INK, 1.1)
    c.setFont("PTM-Bold", 15)
    c.setFillColor(INK)
    c.drawString(MARGIN, PAGE_H - 157 * mm, "НЕ ЭФФЕКТ. СИСТЕМА.")
    paragraph(
        c,
        "MIDGAS выглядит как действующий исследовательский реестр. Визуальный язык строится на "
        "типографике, прямоугольной сетке, документальных изображениях и точных подписях.",
        MARGIN,
        PAGE_H - 168 * mm,
        138 * mm,
        size=9,
        leading=14,
    )

    rules = [
        ("01", "НУЛЕВОЙ РАДИУС", "Никаких скруглений, капсул и мягких карточек."),
        ("02", "ОДНА ГАРНИТУРА", "PT Mono Regular и PT Mono Bold."),
        ("03", "ЦВЕТ КАК СИГНАЛ", "Акцент применяется редко и функционально."),
        ("04", "ДАННЫЕ ПЕРВИЧНЫ", "Дизайн делает структуру видимой, а не украшает ее."),
    ]
    start_y = PAGE_H - 205 * mm
    col_w = (CONTENT_W - 8 * mm) / 2
    for idx, (num, title, body) in enumerate(rules):
        col = idx % 2
        row = idx // 2
        x = MARGIN + col * (col_w + 8 * mm)
        y = start_y - row * 31 * mm
        c.setFillColor(SIGNAL)
        c.rect(x, y - 2 * mm, 3 * mm, 21 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("PTM-Bold", 8)
        c.drawString(x + 6 * mm, y + 13 * mm, f"{num} / {title}")
        paragraph(c, body, x + 6 * mm, y + 8 * mm, col_w - 8 * mm, size=7.3, leading=10.5)

    c.showPage()


def page_typography(c: canvas.Canvas) -> None:
    background(c)
    header(c, "01 / TYPOGRAPHY", 2)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 24)
    c.drawString(MARGIN, PAGE_H - 36 * mm, "PT MONO")
    c.setFont("PTM", 8)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 36 * mm, "REGULAR / BOLD / CYRILLIC + LATIN")
    rule(c, PAGE_H - 43 * mm, INK, 1.1)

    label(c, "PT Mono Bold / identity", MARGIN, PAGE_H - 56 * mm)
    c.setFont("PTM-Bold", 32)
    c.setFillColor(INK)
    c.drawString(MARGIN, PAGE_H - 74 * mm, "КЛИЕНТ / 0001")
    c.setFont("PTM-Bold", 20)
    c.drawString(MARGIN, PAGE_H - 88 * mm, "АНОМАЛИЯ: АКТИВНА")

    label(c, "PT Mono Regular / reading", MARGIN, PAGE_H - 105 * mm)
    paragraph(
        c,
        "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ<br/>"
        "абвгдежзийклмнопрстуфхцчшщъыьэюя<br/>"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ / 0123456789",
        MARGIN,
        PAGE_H - 112 * mm,
        CONTENT_W,
        size=10,
        leading=16,
    )

    rule(c, PAGE_H - 143 * mm)
    label(c, "Scale", MARGIN, PAGE_H - 155 * mm)
    scale = [
        ("DISPLAY", "64 / 64", 30, "THE MIDGAS"),
        ("H1", "40 / 44", 20, "БАЗА АНОМАЛИЙ"),
        ("H2", "28 / 32", 14, "MID-A-0048 / ОБЪЕКТ"),
        ("BODY", "15 / 24", 9, "Краткое описание объекта и зарегистрированных проявлений."),
        ("LABEL", "11 / 16", 7, "СТАТУС / МЕСТОПОЛОЖЕНИЕ / ДОСТУП"),
    ]
    y = PAGE_H - 167 * mm
    for name, metrics, size, sample in scale:
        c.setStrokeColor(GRID)
        c.line(MARGIN, y - 5 * mm, PAGE_W - MARGIN, y - 5 * mm)
        c.setFillColor(MUTED)
        c.setFont("PTM", 6.5)
        c.drawString(MARGIN, y, name)
        c.drawString(MARGIN + 26 * mm, y, metrics)
        c.setFillColor(INK)
        c.setFont("PTM-Bold" if name != "BODY" else "PTM", size)
        c.drawString(MARGIN + 54 * mm, y - 1 * mm, sample)
        y -= 20 * mm

    c.setFillColor(INK)
    c.rect(MARGIN, 26 * mm, CONTENT_W, 25 * mm, fill=1, stroke=0)
    c.setFillColor(SURFACE)
    c.setFont("PTM-Bold", 8)
    c.drawString(MARGIN + 6 * mm, 42 * mm, "RULE / TYPOGRAPHY")
    c.setFont("PTM", 7.2)
    c.drawString(MARGIN + 6 * mm, 33 * mm, "ОДНА ГАРНИТУРА. НИКАКОГО КУРСИВА. ПРОПИСНЫЕ - ТОЛЬКО ДЛЯ СИСТЕМНЫХ МЕТОК.")
    c.showPage()


def page_color_grid(c: canvas.Canvas) -> None:
    background(c)
    header(c, "02 / COLOR + GRID", 3)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 24)
    c.drawString(MARGIN, PAGE_H - 36 * mm, "COLOR / GRID")
    rule(c, PAGE_H - 43 * mm, INK, 1.1)

    label(c, "Core palette", MARGIN, PAGE_H - 55 * mm)
    swatches = [
        ("PAPER", "#F7F8F6", PAPER),
        ("SURFACE", "#FFFFFF", SURFACE),
        ("INK", "#111111", INK),
        ("MUTED", "#6B6F6A", MUTED),
        ("GRID", "#D9DCD6", GRID),
        ("SIGNAL", "#FF4D00", SIGNAL),
    ]
    gap = 3 * mm
    sw = (CONTENT_W - gap * 5) / 6
    sy = PAGE_H - 96 * mm
    for idx, (name, value, color) in enumerate(swatches):
        x = MARGIN + idx * (sw + gap)
        c.setFillColor(color)
        c.setStrokeColor(GRID if name in {"PAPER", "SURFACE"} else color)
        c.rect(x, sy, sw, 30 * mm, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont("PTM-Bold", 6.5)
        c.drawString(x, sy - 5 * mm, name)
        c.setFont("PTM", 6)
        c.drawString(x, sy - 10 * mm, value)

    paragraph(
        c,
        "Базовая среда остается монохромной. SIGNAL используется для активного фокуса, предупреждений, "
        "идентификаторов и выбранной навигации. Нормальная страница не должна содержать более 10% акцентного цвета.",
        MARGIN,
        PAGE_H - 117 * mm,
        CONTENT_W,
        size=8,
        leading=12,
    )

    rule(c, PAGE_H - 142 * mm)
    label(c, "12-column desktop grid", MARGIN, PAGE_H - 153 * mm)
    grid_y = PAGE_H - 205 * mm
    grid_h = 42 * mm
    gutter = 2.2 * mm
    col = (CONTENT_W - 11 * gutter) / 12
    for idx in range(12):
        x = MARGIN + idx * (col + gutter)
        c.setFillColor(SURFACE)
        c.setStrokeColor(GRID)
        c.rect(x, grid_y, col, grid_h, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("PTM", 5.5)
        c.drawCentredString(x + col / 2, grid_y + 3 * mm, str(idx + 1))

    label(c, "Spacing sequence", MARGIN, PAGE_H - 220 * mm)
    spacings = [4, 8, 12, 16, 24, 32, 48, 64]
    y = PAGE_H - 232 * mm
    for value in spacings:
        c.setFillColor(SIGNAL if value in {4, 16, 64} else INK)
        c.rect(MARGIN + 18 * mm, y, value * 1.35, 2.5 * mm, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont("PTM", 6.5)
        c.drawRightString(MARGIN + 14 * mm, y + 0.5 * mm, f"{value:02d}")
        y -= 7 * mm

    c.setStrokeColor(INK)
    c.setLineWidth(1)
    c.rect(MARGIN + 83 * mm, PAGE_H - 270 * mm, 90 * mm, 40 * mm, fill=0, stroke=1)
    c.setFillColor(SIGNAL)
    c.rect(MARGIN + 83 * mm, PAGE_H - 270 * mm, 4 * mm, 40 * mm, fill=1, stroke=0)
    label(c, "Geometry", MARGIN + 92 * mm, PAGE_H - 239 * mm, INK)
    paragraph(
        c,
        "RADIUS: 0<br/>BORDER: 1 PX<br/>EMPHASIS: 2 PX<br/>BASE UNIT: 4 PX",
        MARGIN + 92 * mm,
        PAGE_H - 246 * mm,
        70 * mm,
        size=7.5,
        leading=11,
        bold=True,
    )
    c.showPage()


def page_components(c: canvas.Canvas) -> None:
    background(c)
    header(c, "03 / COMPONENTS", 4)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 24)
    c.drawString(MARGIN, PAGE_H - 36 * mm, "DATA COMPONENTS")
    rule(c, PAGE_H - 43 * mm, INK, 1.1)

    # Client registry module
    card_top = PAGE_H - 55 * mm
    card_h = 96 * mm
    card_y = card_top - card_h
    c.setFillColor(SURFACE)
    c.setStrokeColor(INK)
    c.setLineWidth(1)
    c.rect(MARGIN, card_y, CONTENT_W, card_h, fill=1, stroke=1)
    c.setFillColor(SIGNAL)
    c.rect(MARGIN, card_y, 4 * mm, card_h, fill=1, stroke=0)

    px = MARGIN + 10 * mm
    py = card_y + 12 * mm
    pw = 49 * mm
    ph = 68 * mm
    c.drawImage(client_photo(), px, py, width=pw, height=ph, mask="auto")
    c.setStrokeColor(INK)
    c.rect(px, py, pw, ph, fill=0, stroke=1)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 7)
    c.drawString(px, py + ph + 5 * mm, "MID-C-0001 / CLIENT")

    ix = px + pw + 12 * mm
    iw = PAGE_W - MARGIN - 8 * mm - ix
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 19)
    c.drawString(ix, card_y + card_h - 18 * mm, "ГАЛИНА КРАПИВКИНА")
    c.setFont("PTM", 7.5)
    c.setFillColor(MUTED)
    c.drawString(ix, card_y + card_h - 26 * mm, "СВЯТАЯ ГАЛИНА ПРАРОДИТЕЛЬНИЦА")
    c.setStrokeColor(GRID)
    c.line(ix, card_y + card_h - 32 * mm, PAGE_W - MARGIN - 8 * mm, card_y + card_h - 32 * mm)

    col_w = (iw - 6 * mm) / 2
    field(c, "Тип", "Человек / первочеловек", ix, card_y + card_h - 42 * mm, col_w)
    field(c, "Статус", "Активна", ix + col_w + 6 * mm, card_y + card_h - 42 * mm, col_w)
    field(c, "Допуск", "D5 / максимальный", ix, card_y + card_h - 59 * mm, col_w)
    field(c, "Угроза", "0 / НЕ УСТАНОВЛЕНА", ix + col_w + 6 * mm, card_y + card_h - 59 * mm, col_w)
    label(c, "Местоположение", ix, card_y + card_h - 76 * mm)
    c.setFont("PTM-Bold", 8)
    c.setFillColor(INK)
    c.drawString(ix, card_y + card_h - 83 * mm, "ХАБАРОВСК / ДУБАЙ")

    # Tags and scales
    label(c, "Rectangular tags", MARGIN, card_y - 13 * mm)
    x = MARGIN
    for idx, tag in enumerate(("ПЕРВОЧЕЛОВЕК", "ПОРТАЛ", "ЗАЩИТА", "АКТИВНА")):
        x = square_tag(c, tag, x, card_y - 24 * mm, accent=idx == 3)

    label(c, "Threat scale", MARGIN + 118 * mm, card_y - 13 * mm)
    sx = MARGIN + 118 * mm
    for idx in range(5):
        c.setFillColor(INK if idx < 3 else SURFACE)
        c.setStrokeColor(INK)
        c.rect(sx + idx * 8 * mm, card_y - 24 * mm, 6 * mm, 6 * mm, fill=1, stroke=1)
    c.setFillColor(MUTED)
    c.setFont("PTM", 6)
    c.drawString(sx + 43 * mm, card_y - 22 * mm, "3 / 5")

    rule(c, card_y - 38 * mm)
    label(c, "Registry row", MARGIN, card_y - 49 * mm)
    row_y = card_y - 78 * mm
    row_h = 20 * mm
    c.setFillColor(SURFACE)
    c.setStrokeColor(GRID)
    c.rect(MARGIN, row_y, CONTENT_W, row_h, fill=1, stroke=1)
    c.setFillColor(SIGNAL)
    c.rect(MARGIN, row_y, 3 * mm, row_h, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 7.5)
    c.drawString(MARGIN + 8 * mm, row_y + 12 * mm, "MID-C-0001")
    c.drawString(MARGIN + 45 * mm, row_y + 12 * mm, "ГАЛИНА КРАПИВКИНА")
    c.setFont("PTM", 6.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN + 45 * mm, row_y + 6 * mm, "ЧЕЛОВЕК / АКТИВНА / ХАБАРОВСК")
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 7)
    c.drawRightString(PAGE_W - MARGIN - 8 * mm, row_y + 9 * mm, "ОТКРЫТЬ ->")

    c.setFillColor(INK)
    c.rect(MARGIN, 25 * mm, CONTENT_W, 20 * mm, fill=1, stroke=0)
    c.setFillColor(SURFACE)
    c.setFont("PTM-Bold", 7.2)
    c.drawString(MARGIN + 6 * mm, 37 * mm, "SYSTEM RULE")
    c.setFont("PTM", 6.8)
    c.drawString(MARGIN + 6 * mm, 30 * mm, "NO RADIUS / NO SHADOW / NO GRADIENT / NO DECORATIVE STATUS COLOR")
    c.showPage()


def page_one_sheet(c: canvas.Canvas) -> None:
    background(c)
    header(c, "VISUAL STYLE / ONE-SHEET", 1, 1)

    # Identity
    c.setFillColor(SIGNAL)
    c.rect(MARGIN, PAGE_H - 78 * mm, 4 * mm, 42 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 34)
    c.drawString(MARGIN + 10 * mm, PAGE_H - 52 * mm, "THE MIDGAS")
    c.setFont("PTM", 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN + 10 * mm, PAGE_H - 62 * mm, "RESEARCH DATA SYSTEM / VISUAL FOUNDATION V0.1")
    c.setFont("PTM-Bold", 7)
    c.setFillColor(INK)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 48 * mm, "RADIUS / 0")
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 56 * mm, "BORDER / 1 PX")
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 64 * mm, "GRID / 4 PX")
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 72 * mm, "COLOR / PHOTO ONLY")

    # Typography
    rule(c, PAGE_H - 91 * mm, INK, 1.1)
    label(c, "01 / Typography", MARGIN, PAGE_H - 100 * mm, INK)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 23)
    c.drawString(MARGIN, PAGE_H - 116 * mm, "КЛИЕНТ / АНОМАЛИЯ / 0001")
    c.setFont("PTM", 8.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, PAGE_H - 127 * mm, "PT MONO REGULAR: АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩ / 0123456789")

    # Palette and geometry
    rule(c, PAGE_H - 140 * mm)
    label(c, "02 / Color + geometry", MARGIN, PAGE_H - 149 * mm, INK)
    swatches = [
        ("PAPER", "#FFFFFF", PAPER),
        ("SURFACE", "#FFFFFF", SURFACE),
        ("INK", "#000000", INK),
        ("MUTED", "#5C5C5C", MUTED),
        ("GRID", "#D8D8D8", GRID),
    ]
    gap = 3 * mm
    sw = (CONTENT_W - gap * (len(swatches) - 1)) / len(swatches)
    sw_y = PAGE_H - 179 * mm
    for idx, (name, value, color) in enumerate(swatches):
        x = MARGIN + idx * (sw + gap)
        c.setFillColor(color)
        c.setStrokeColor(GRID if name in {"PAPER", "SURFACE"} else color)
        c.rect(x, sw_y, sw, 18 * mm, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont("PTM-Bold", 5.8)
        c.drawString(x, sw_y - 4.5 * mm, name)
        c.setFont("PTM", 5.5)
        c.drawString(x, sw_y - 8.5 * mm, value)

    # Component sample
    rule(c, PAGE_H - 199 * mm)
    label(c, "03 / Client component", MARGIN, PAGE_H - 208 * mm, INK)
    card_y = 29 * mm
    card_h = 69 * mm
    c.setFillColor(SURFACE)
    c.setStrokeColor(INK)
    c.setLineWidth(1)
    c.rect(MARGIN, card_y, CONTENT_W, card_h, fill=1, stroke=1)
    c.setFillColor(SIGNAL)
    c.rect(MARGIN, card_y, 4 * mm, card_h, fill=1, stroke=0)

    photo_x = MARGIN + 10 * mm
    photo_y = card_y + 8 * mm
    photo_w = 37 * mm
    photo_h = 49 * mm
    c.drawImage(client_photo(), photo_x, photo_y, width=photo_w, height=photo_h, mask="auto")
    c.setStrokeColor(INK)
    c.rect(photo_x, photo_y, photo_w, photo_h, fill=0, stroke=1)
    c.setFillColor(INK)
    c.setFont("PTM-Bold", 6.5)
    c.drawString(photo_x, photo_y + photo_h + 4 * mm, "MID-C-0001 / CLIENT")

    info_x = photo_x + photo_w + 10 * mm
    info_w = PAGE_W - MARGIN - 8 * mm - info_x
    c.setFont("PTM-Bold", 15)
    c.drawString(info_x, card_y + card_h - 15 * mm, "ГАЛИНА КРАПИВКИНА")
    c.setFont("PTM", 6.5)
    c.setFillColor(MUTED)
    c.drawString(info_x, card_y + card_h - 22 * mm, "СВЯТАЯ ГАЛИНА ПРАРОДИТЕЛЬНИЦА")
    c.setStrokeColor(GRID)
    c.line(info_x, card_y + card_h - 28 * mm, PAGE_W - MARGIN - 8 * mm, card_y + card_h - 28 * mm)

    col_w = (info_w - 5 * mm) / 2
    field(c, "Тип", "Человек / первочеловек", info_x, card_y + card_h - 37 * mm, col_w)
    field(c, "Статус", "Активна", info_x + col_w + 5 * mm, card_y + card_h - 37 * mm, col_w)
    field(c, "Допуск", "D5 / максимальный", info_x, card_y + card_h - 52 * mm, col_w)
    field(c, "Местоположение", "Хабаровск / Дубай", info_x + col_w + 5 * mm, card_y + card_h - 52 * mm, col_w)

    c.setFillColor(INK)
    c.rect(MARGIN, 18 * mm, CONTENT_W, 6 * mm, fill=1, stroke=0)
    c.setFillColor(SURFACE)
    c.setFont("PTM-Bold", 5.8)
    c.drawString(MARGIN + 3 * mm, 20 * mm, "NO RADIUS / NO SHADOW / NO GRADIENT / DATA FIRST")
    c.showPage()


def generate() -> None:
    setup_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("THE MIDGAS - Visual System v0.1")
    c.setAuthor("THE MIDGAS")
    c.setSubject("Working visual identity foundation")
    page_one_sheet(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    generate()
