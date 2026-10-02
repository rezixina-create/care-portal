import os
import sys
import math

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
except ImportError:
    print("PIL not installed, will fallback to PowerShell System.Drawing")
    sys.exit(2)

def create_suzuki_bed_scene():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    suzuki_src = os.path.join(base_dir, "data", "photos", "personal", "resident_suzuki_snap_backup.jpg")
    tome_src = os.path.join(base_dir, "tests", "tome_1.jpg")
    out_path = os.path.join(base_dir, "data", "photos", "personal", "resident_suzuki_snap.jpg")

    if not os.path.exists(suzuki_src):
        # Fallback to current snap if backup doesn't exist
        suzuki_src = os.path.join(base_dir, "data", "photos", "personal", "resident_suzuki_snap.jpg")

    width, height = 1000, 750
    # 1. Canvas - room wall background (calm warm beige/cream interior)
    canvas = Image.new("RGB", (width, height), (228, 222, 212))
    draw = ImageDraw.Draw(canvas)

    # Wall gradient / soft shadow
    for y in range(height):
        ratio = y / height
        r = int(228 - ratio * 18)
        g = int(222 - ratio * 18)
        b = int(212 - ratio * 18)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # 2. Wooden Headboard & Bed frame (tilted back slightly for gatch-up angle ~35 deg)
    # Headboard base
    headboard_color = (138, 92, 58)
    headboard_highlight = (162, 112, 75)
    draw.rectangle([60, 100, 940, 420], fill=headboard_color)
    # Wood grain planks
    for h_y in range(120, 410, 45):
        draw.line([(65, h_y), (935, h_y)], fill=(110, 72, 42), width=3)
        draw.line([(65, h_y + 2), (935, h_y + 2)], fill=headboard_highlight, width=1)

    # 3. Gatch-up Backrest Mattress & Pillow
    # Elevated backrest at ~35 degrees angle
    backrest_poly = [(120, 220), (880, 220), (840, 520), (160, 520)]
    draw.polygon(backrest_poly, fill=(238, 235, 228))
    draw.line([(120, 220), (880, 220)], fill=(200, 195, 185), width=2)

    # Fluffy Medical / Nursing Pillow
    # Pillow ellipse centered where head rests
    pillow_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(pillow_img)
    # Soft pillow shadow
    p_draw.ellipse([310, 205, 730, 465], fill=(160, 155, 145, 140))
    # Pillow body
    p_draw.ellipse([320, 195, 720, 445], fill=(248, 246, 242, 255))
    p_draw.ellipse([340, 210, 700, 430], fill=(255, 254, 250, 255))
    pillow_img = pillow_img.filter(ImageFilter.GaussianBlur(radius=6))
    canvas.paste(pillow_img, (0, 0), pillow_img)

    # 4. Suzuki-san Face and Head (peacefully resting on pillow, gatch-up posture)
    if os.path.exists(suzuki_src):
        src_img = Image.open(suzuki_src).convert("RGB")
        # In original resident_suzuki_snap_backup: face is around center top
        # Image size is typically ~1200x900 or 1024x768
        sw, sh = src_img.size
        # Crop head region: x: 0.35 -> 0.65, y: 0.08 -> 0.55
        crop_box = (int(sw * 0.32), int(sh * 0.08), int(sw * 0.68), int(sh * 0.52))
        head_crop = src_img.crop(crop_box)
        
        # Resize head to fit comfortably on pillow
        target_hw = 360
        target_hh = int(target_hw * (head_crop.height / head_crop.width))
        head_resized = head_crop.resize((target_hw, target_hh), Image.Resampling.LANCZOS)
        
        # Slight recline rotation (~5 degrees tilt to show relaxed resting on pillow)
        head_rotated = head_resized.rotate(4, resample=Image.Resampling.BICUBIC, expand=True)
        
        # Soft feather mask for seamless blending with pillow and blanket
        mask = Image.new("L", head_rotated.size, 0)
        m_draw = ImageDraw.Draw(mask)
        mw, mh = head_rotated.size
        # Elliptical mask focusing on face, white hair, and neck
        m_draw.ellipse([int(mw * 0.12), int(mh * 0.08), int(mw * 0.88), int(mh * 0.90)], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=15))

        # Paste head onto pillow
        head_pos_x = int(width * 0.5 - mw * 0.5 + 10)
        head_pos_y = int(height * 0.32 - mh * 0.5 + 40)
        canvas.paste(head_rotated, (head_pos_x, head_pos_y), mask)

    # 5. Warm Blanket / Futon Covering Body (up to chest/shoulders)
    blanket_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(blanket_layer)

    # Quilt / blanket base shape (curving over body and tucking in)
    blanket_color = (215, 205, 190, 255) # Warm natural greige/beige futon
    blanket_shade = (185, 175, 160, 255)
    blanket_highlight = (235, 228, 218, 255)

    # Soft blanket top edge across chest at y ~ 450
    blanket_poly = [
        (80, 480),
        (260, 440),
        (510, 435),
        (760, 445),
        (920, 490),
        (940, height),
        (60, height)
    ]
    b_draw.polygon(blanket_poly, fill=blanket_color)

    # Blanket fold / collar roll
    collar_poly = [
        (100, 475),
        (260, 435),
        (510, 430),
        (760, 440),
        (900, 485),
        (890, 520),
        (750, 480),
        (510, 470),
        (270, 475),
        (110, 515)
    ]
    b_draw.polygon(collar_poly, fill=blanket_highlight)
    
    # Blanket creases and folds (drapes)
    b_draw.line([(320, 475), (280, 720)], fill=blanket_shade, width=5)
    b_draw.line([(510, 470), (500, 730)], fill=blanket_shade, width=6)
    b_draw.line([(700, 480), (740, 720)], fill=blanket_shade, width=5)
    
    # Soften blanket layer
    blanket_layer = blanket_layer.filter(ImageFilter.GaussianBlur(radius=3))
    canvas.paste(blanket_layer, (0, 0), blanket_layer)

    # 6. Bed Side Rail (Safety Barrier / Gatch-up Bed Rail)
    rail_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    r_draw = ImageDraw.Draw(rail_layer)

    rail_color = (195, 190, 180, 230)
    rail_dark = (140, 135, 125, 230)
    rail_hi = (230, 228, 222, 230)

    # Bottom rail bar
    r_draw.rectangle([50, 620, 950, 636], fill=rail_color)
    r_draw.line([(50, 620), (950, 620)], fill=rail_hi, width=2)
    r_draw.line([(50, 636), (950, 636)], fill=rail_dark, width=2)

    # Top rail bar (angled following gatch-up)
    r_draw.line([(80, 390), (450, 390)], fill=rail_color, width=14)
    r_draw.line([(80, 384), (450, 384)], fill=rail_hi, width=2)
    r_draw.line([(80, 396), (450, 396)], fill=rail_dark, width=2)

    # Vertical spindles of the bed rail
    for rx in range(120, 440, 60):
        r_draw.rectangle([rx, 390, rx + 10, 620], fill=rail_color)
        r_draw.line([(rx, 390), (rx, 620)], fill=rail_hi, width=1)
        r_draw.line([(rx + 10, 390), (rx + 10, 620)], fill=rail_dark, width=1)

    rail_layer = rail_layer.filter(ImageFilter.GaussianBlur(radius=1))
    canvas.paste(rail_layer, (0, 0), rail_layer)

    # 7. Final Atmospheric Grading (Warm, Peaceful, Dignified Care Room)
    enhancer = ImageEnhance.Color(canvas)
    canvas = enhancer.enhance(1.05)
    contrast = ImageEnhance.Contrast(canvas)
    canvas = contrast.enhance(1.02)

    canvas.save(out_path, "JPEG", quality=92)
    print(f"Successfully generated dignified bed gatch-up photo: {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    create_suzuki_bed_scene()
