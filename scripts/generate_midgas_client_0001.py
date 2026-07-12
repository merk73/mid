from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps
from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = ROOT / "midgas" / "A5 - 25.pdf"
OUTPUT_PDF = ROOT / "output" / "pdf" / "MID-C-0001_Galina-Krapivkina_A4.pdf"

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_BLACK = Path(r"C:\Windows\Fonts\seguibl.ttf")

INK = HexColor("#111418")
MUTED = HexColor("#68707A")
LINE = HexColor("#DCE1E7")
PANEL = HexColor("#F3F6F9")
ACCENT = HexColor("#1769FF")
WHITE = HexColor("#FFFFFF")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("MIDGAS", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MIDGAS-Bold", str(FONT_BOLD)))
    pdfmetrics.registerFont(TTFont("MIDGAS-Black", str(FONT_BLACK)))


def extract_portrait() -> Image.Image:
    page = PdfReader(str(SOURCE_PDF)).pages[0]
    images = [item.image for item in page.images]
    portrait = max(images, key=lambda image: image.width * image.height)
    return portrait.convert("RGB")


def paragraph(c: canvas.Canvas, text: str, style: ParagraphStyle, x: float, y_top: float, width: float) -> float:
    item = Paragraph(text, style)
    _, height = item.wrap(width, 300 * mm)
    item.drawOn(c, x, y_top - height)
    return y_top - height


def label(c: canvas.Canvas, text: str, x: float, y: float) -> None:
    c.setFont("MIDGAS-Bold", 6.8)
    c.setFillColor(MUTED)
    c.drawString(x, y, text.upper())


def field(c: canvas.Canvas, title: str, value: str, x: float, y: float, width: float) -> float:
    label(c, title, x, y)
    style = ParagraphStyle(
        name="field",
        fontName="MIDGAS-Bold",
        fontSize=9.5,
        leading=11.5,
        textColor=INK,
        alignment=TA_LEFT,
    )
    return paragraph(c, value, style, x, y - 4 * mm, width)


def create_pdf() -> None:
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    register_fonts()

    page_width, page_height = A4
    c = canvas.Canvas(str(OUTPUT_PDF), pagesize=A4, pageCompression=1)
    c.setTitle("MID-C-0001 - Галина Крапивкина")
    c.setAuthor("THE MIDGAS")
    c.setSubject("Внутренняя карточка клиента")

    margin = 16 * mm
    content_width = page_width - 2 * margin

    # Header
    c.setFillColor(INK)
    c.setFont("MIDGAS-Black", 9.5)
    c.drawString(margin, page_height - 17 * mm, "THE MIDGAS")
    c.setFont("MIDGAS", 7.2)
    c.setFillColor(MUTED)
    c.drawRightString(page_width - margin, page_height - 17 * mm, "ВНУТРЕННИЙ АРХИВ / КЛИЕНТСКАЯ БАЗА")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(margin, page_height - 22 * mm, page_width - margin, page_height - 22 * mm)

    # Main portrait
    photo_x = margin
    photo_y = page_height - 126 * mm
    photo_w = 64 * mm
    photo_h = 91 * mm
    portrait = ImageOps.fit(extract_portrait(), (768, 1092), method=Image.Resampling.LANCZOS, centering=(0.5, 0.42))
    photo_buffer = BytesIO()
    portrait.save(photo_buffer, format="JPEG", quality=94)
    photo_buffer.seek(0)
    c.drawImage(ImageReader(photo_buffer), photo_x, photo_y, width=photo_w, height=photo_h, mask="auto")
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.5)
    c.rect(photo_x, photo_y, photo_w, photo_h, fill=0, stroke=1)

    # Identity block
    info_x = photo_x + photo_w + 10 * mm
    info_w = page_width - margin - info_x
    top_y = page_height - 34 * mm

    c.setFillColor(ACCENT)
    c.roundRect(info_x, top_y - 8 * mm, 34 * mm, 8 * mm, 1.8 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("MIDGAS-Bold", 8.3)
    c.drawCentredString(info_x + 17 * mm, top_y - 5.5 * mm, "MID-C-0001")

    c.setFillColor(INK)
    c.setFont("MIDGAS-Black", 22)
    c.drawString(info_x, top_y - 20 * mm, "ГАЛИНА")
    c.drawString(info_x, top_y - 29 * mm, "КРАПИВКИНА")

    alias_style = ParagraphStyle(
        name="alias",
        fontName="MIDGAS",
        fontSize=9.2,
        leading=11.2,
        textColor=MUTED,
    )
    y = paragraph(c, "Святая Галина Прародительница", alias_style, info_x, top_y - 34 * mm, info_w)
    y -= 8 * mm

    col_gap = 7 * mm
    col_w = (info_w - col_gap) / 2
    y_left = field(c, "Тип", "Человек / первочеловек", info_x, y, col_w)
    y_right = field(c, "Статус", "Активна", info_x + col_w + col_gap, y, col_w)
    y = min(y_left, y_right) - 7 * mm
    y_left = field(c, "Состояние", "Бессмертная", info_x, y, col_w)
    y_right = field(c, "Допуск MIDGAS", "D5 / максимальный", info_x + col_w + col_gap, y, col_w)
    y = min(y_left, y_right) - 7 * mm
    y_left = field(c, "Угроза", "Не установлена", info_x, y, col_w)
    y_right = field(c, "Режим", "Постоянное наблюдение", info_x + col_w + col_gap, y, col_w)
    y = min(y_left, y_right) - 7 * mm
    field(c, "Местоположение", "Хабаровск, Россия / Дубай, ОАЭ", info_x, y, info_w)

    # Description area
    section_top = photo_y - 13 * mm
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(margin, section_top + 5 * mm, page_width - margin, section_top + 5 * mm)
    label(c, "Краткое описание", margin, section_top)

    summary_style = ParagraphStyle(
        name="summary",
        fontName="MIDGAS",
        fontSize=10.3,
        leading=15.2,
        textColor=INK,
        spaceAfter=4 * mm,
    )
    summary = (
        "Галина Крапивкина - первочеловек, одна из восьми первых людей, заселивших Землю. "
        "Биологический возраст определяется как вечный; хронологическое присутствие отсчитывается "
        "от Сотворения мира. В настоящее время использует образ учителя физики предпенсионного "
        "возраста и сохраняет неизменные биометрические параметры."
    )
    summary_y = paragraph(c, summary, summary_style, margin, section_top - 8 * mm, content_width)

    c.setFillColor(PANEL)
    box_y = summary_y - 43 * mm
    c.roundRect(margin, box_y, content_width, 36 * mm, 2.5 * mm, fill=1, stroke=0)

    note_style = ParagraphStyle(
        name="note",
        fontName="MIDGAS",
        fontSize=8.7,
        leading=12.2,
        textColor=INK,
    )
    label(c, "Оперативная характеристика", margin + 6 * mm, box_y + 28 * mm)
    note = (
        "Основные функции - защита детей от влияния рептилоидов и поддержание энергетического щита. "
        "Для перемещения между Хабаровском и Дубаем использует портал. Поездки связаны со Звездным "
        "порталом под Персидским заливом. В архиве MIDGAS зарегистрировано присутствие клиента в "
        "Розуэлле в 1947 году."
    )
    paragraph(c, note, note_style, margin + 6 * mm, box_y + 23 * mm, content_width - 12 * mm)

    # Footer
    footer_y = 13 * mm
    c.setStrokeColor(LINE)
    c.line(margin, footer_y + 6 * mm, page_width - margin, footer_y + 6 * mm)
    c.setFillColor(MUTED)
    c.setFont("MIDGAS", 6.8)
    c.drawString(margin, footer_y, "THE MIDGAS / НЬЮ-ЙОРК - АНДРЕЕВКА")
    c.drawCentredString(page_width / 2, footer_y, "КАРТОЧКА КЛИЕНТА / РЕДАКЦИЯ 01")
    c.drawRightString(page_width - margin, footer_y, "1 / 1")

    c.showPage()
    c.save()


if __name__ == "__main__":
    create_pdf()
    print(OUTPUT_PDF)
