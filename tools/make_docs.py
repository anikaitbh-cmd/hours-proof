"""Draw fictional documents with known answers.

Outputs
  public/samples/dana/*.png         Dana's four demo documents (fictional)
  bench/fixtures/clean/*.png        benchmark set, clean renders
  bench/fixtures/messy/*.jpg        same documents, degraded like phone photos
  bench/fixtures/answers.json       expected fields for every fixture

Every name, employer, address and number here is made up.
Run: python3 tools/make_docs.py
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SUP = "/System/Library/Fonts/Supplemental/"
FONTS = {
    "sans": SUP + "Arial.ttf",
    "sansb": SUP + "Arial Bold.ttf",
    "serif": SUP + "Times New Roman.ttf",
    "serifb": SUP + "Times New Roman Bold.ttf",
    "mono": SUP + "Courier New.ttf",
    "monob": SUP + "Courier New Bold.ttf",
}


def font(kind, size):
    return ImageFont.truetype(FONTS[kind], size)


def d(x: date) -> str:
    return x.strftime("%m/%d/%Y")


def iso(x: date) -> str:
    return x.isoformat()


def money(x: float) -> str:
    return f"${x:,.2f}"


# ---------------------------------------------------------------- pay stubs

def stub_a(f):
    """Clean corporate stub: header band, earnings table."""
    W, H = 1100, 800
    im = Image.new("RGB", (W, H), "white")
    g = ImageDraw.Draw(im)
    g.rectangle([0, 0, W, 90], fill=(32, 62, 102))
    g.text((40, 22), f["employer"], font=font("sansb", 34), fill="white")
    g.text((W - 330, 32), "EARNINGS STATEMENT", font=font("sansb", 22), fill="white")
    y = 120
    rows = [
        ("Employee", f["employee"]),
        ("Pay period", f"{d(f['start'])} - {d(f['end'])}"),
        ("Pay date", d(f["paydate"])),
    ]
    for k, v in rows:
        g.text((40, y), k, font=font("sans", 22), fill=(90, 90, 90))
        g.text((260, y), v, font=font("sans", 22), fill="black")
        y += 36
    y += 20
    g.line([40, y, W - 40, y], fill=(32, 62, 102), width=3)
    y += 12
    cols = [40, 330, 520, 720, 900]
    for x, h in zip(cols, ["Earnings", "Rate", "Hours", "This period", "Year to date"]):
        g.text((x, y), h, font=font("sansb", 22), fill="black")
    y += 40
    vals = ["Regular", money(f["rate"]), f"{f['hours']:.2f}", money(f["gross"]), money(f["ytd"])]
    for x, v in zip(cols, vals):
        g.text((x, y), v, font=font("sans", 22), fill="black")
    y += 60
    g.line([40, y, W - 40, y], fill=(200, 200, 200), width=2)
    y += 16
    ded = round(f["gross"] * 0.0765, 2)
    for k, v in [("Gross pay", money(f["gross"])), ("Social Security + Medicare", "-" + money(ded)),
                 ("Net pay", money(f["gross"] - ded))]:
        g.text((520, y), k, font=font("sansb" if k == "Net pay" else "sans", 22), fill="black")
        g.text((900, y), v, font=font("sansb" if k == "Net pay" else "sans", 22), fill="black")
        y += 36
    g.text((40, H - 50), "Fictional document for testing. Not a real employer.", font=font("sans", 16), fill=(150, 150, 150))
    return im


def stub_b(f):
    """Dot-matrix style stub: monospace, labels and values on one line."""
    W, H = 1000, 760
    im = Image.new("RGB", (W, H), (250, 248, 240))
    g = ImageDraw.Draw(im)
    m = font("mono", 24)
    mb = font("monob", 26)
    lines = [
        (mb, f["employer"].upper()),
        (m, f["address"]),
        (m, ""),
        (mb, "PAY STUB"),
        (m, f"EMPLOYEE: {f['employee']}"),
        (m, f"PERIOD BEGIN: {d(f['start'])}   PERIOD END: {d(f['end'])}"),
        (m, f"CHECK DATE: {d(f['paydate'])}"),
        (m, "-" * 60),
        (m, f"HOURS WORKED ....... {f['hours']:>8.2f}"),
        (m, f"HOURLY RATE ........ {money(f['rate']):>8}"),
        (m, f"GROSS PAY .......... {money(f['gross']):>8}"),
        (m, f"YTD GROSS .......... {money(f['ytd']):>8}"),
        (m, f"FED W/H ............ {money(round(f['gross']*0.04,2)):>8}"),
        (m, f"NET PAY ............ {money(round(f['gross']*0.8835,2)):>8}"),
        (m, "-" * 60),
        (m, "Fictional document for testing."),
    ]
    y = 40
    for fo, t in lines:
        g.text((50, y), t, font=fo, fill=(40, 40, 60))
        y += 40
    return im


def stub_c(f):
    """Small-business stub: two boxes side by side, serif headings."""
    W, H = 1150, 700
    im = Image.new("RGB", (W, H), "white")
    g = ImageDraw.Draw(im)
    g.text((40, 30), f["employer"], font=font("serifb", 36), fill="black")
    g.text((40, 78), f["address"], font=font("serif", 22), fill=(60, 60, 60))
    g.text((W - 300, 40), f"Paid {d(f['paydate'])}", font=font("serif", 24), fill="black")
    g.rectangle([40, 140, 560, 420], outline="black", width=2)
    g.text((60, 155), "Employee", font=font("serifb", 24), fill="black")
    g.text((60, 195), f["employee"], font=font("serif", 24), fill="black")
    g.text((60, 250), "Work period", font=font("serifb", 24), fill="black")
    g.text((60, 290), f"{f['start'].strftime('%b %d, %Y')} to", font=font("serif", 24), fill="black")
    g.text((60, 325), f"{f['end'].strftime('%b %d, %Y')}", font=font("serif", 24), fill="black")
    g.rectangle([590, 140, W - 40, 420], outline="black", width=2)
    rows = [("Hours", f"{f['hours']:.2f}"), ("Rate / hr", money(f["rate"])), ("Gross wages", money(f["gross"])),
            ("Deductions", money(round(f["gross"] * 0.11, 2))), ("Take-home", money(round(f["gross"] * 0.89, 2)))]
    y = 160
    for k, v in rows:
        g.text((610, y), k, font=font("serif", 24), fill="black")
        g.text((900, y), v, font=font("serif", 24), fill="black")
        y += 50
    g.text((40, 460), f"Year-to-date gross: {money(f['ytd'])}", font=font("serif", 22), fill=(60, 60, 60))
    g.text((40, H - 50), "Fictional document for testing. Not a real employer.", font=font("serif", 18), fill=(150, 150, 150))
    return im


STUBS = [stub_a, stub_b, stub_c]


# ---------------------------------------------------------------- gig summary

def gig(f):
    """Phone-screenshot style earnings summary from a made-up delivery app."""
    W, H = 720, 1400
    im = Image.new("RGB", (W, H), (246, 247, 249))
    g = ImageDraw.Draw(im)
    g.text((40, 30), "9:41", font=font("sansb", 28), fill="black")
    g.rectangle([0, 90, W, 200], fill=(18, 130, 90))
    g.text((40, 115), f["platform"], font=font("sansb", 40), fill="white")
    g.text((40, 230), "Earnings summary", font=font("sansb", 36), fill="black")
    g.text((40, 285), f"{f['start'].strftime('%b %d')} - {f['end'].strftime('%b %d, %Y')}", font=font("sans", 28), fill=(80, 80, 80))
    g.rounded_rectangle([30, 350, W - 30, 560], radius=24, fill="white")
    g.text((60, 375), "Total earnings", font=font("sans", 28), fill=(80, 80, 80))
    g.text((60, 425), money(f["earnings"]), font=font("sansb", 64), fill="black")
    g.rounded_rectangle([30, 590, W - 30, 1000], radius=24, fill="white")
    rows = [
        ("Deliveries", str(f["deliveries"])),
        ("Active time", f"{f['active_min']//60}h {f['active_min']%60:02d}m"),
        ("Online time", f"{f['online_min']//60}h {f['online_min']%60:02d}m"),
        ("Tips", money(f["tips"])),
        ("Base pay", money(round(f["earnings"] - f["tips"], 2))),
    ]
    y = 620
    for k, v in rows:
        g.text((60, y), k, font=font("sans", 30), fill=(60, 60, 60))
        g.text((W - 60 - g.textlength(v, font=font("sansb", 30)), y), v, font=font("sansb", 30), fill="black")
        y += 74
    g.text((40, 1060), "Active time = on a delivery.", font=font("sans", 24), fill=(110, 110, 110))
    g.text((40, 1095), "Online time = app open, waiting or delivering.", font=font("sans", 24), fill=(110, 110, 110))
    g.text((40, H - 80), "Fictional app for testing.", font=font("sans", 22), fill=(150, 150, 150))
    return im


# ---------------------------------------------------------------- volunteer letter

def volunteer(f):
    W, H = 1100, 1400
    im = Image.new("RGB", (W, H), "white")
    g = ImageDraw.Draw(im)
    g.text((80, 70), f["org"], font=font("serifb", 40), fill=(20, 40, 90))
    g.text((80, 125), f["address"], font=font("serif", 24), fill=(60, 60, 60))
    g.line([80, 170, W - 80, 170], fill=(20, 40, 90), width=2)
    g.text((80, 210), d(f["letterdate"]), font=font("serif", 26), fill="black")
    g.text((80, 280), "To whom it may concern:", font=font("serif", 26), fill="black")
    body = (
        f"This letter confirms that {f['volunteer']} volunteered with {f['org']} "
        f"from {f['start'].strftime('%B %d, %Y')} through {f['end'].strftime('%B %d, %Y')}, "
        f"for a total of {f['hours']:g} hours. Their work included {f['activity']}. "
        f"Please contact me with any questions."
    )
    y = 340
    line = ""
    fo = font("serif", 26)
    for word in body.split():
        trial = (line + " " + word).strip()
        if g.textlength(trial, font=fo) > W - 160:
            g.text((80, y), line, font=fo, fill="black")
            y += 40
            line = word
        else:
            line = trial
    g.text((80, y), line, font=fo, fill="black")
    y += 90
    g.text((80, y), "Sincerely,", font=fo, fill="black")
    g.text((80, y + 90), f["contact"], font=font("serifb", 26), fill="black")
    g.text((80, y + 130), f["title"], font=fo, fill="black")
    g.text((80, y + 170), f["phone"], font=fo, fill="black")
    g.text((80, H - 70), "Fictional organization for testing.", font=font("serif", 20), fill=(150, 150, 150))
    return im


# ---------------------------------------------------------------- degrade like a phone photo

def messy(im: Image.Image, rng: random.Random) -> Image.Image:
    im = im.convert("RGB")
    W, H = im.size
    # paper on a table: pad with a darker background
    pad = int(max(W, H) * 0.08)
    bg = Image.new("RGB", (W + 2 * pad, H + 2 * pad), tuple(rng.randint(70, 140) for _ in range(3)))
    bg.paste(im, (pad, pad))
    im = bg.rotate(rng.uniform(-6, 6), resample=Image.BICUBIC, expand=False, fillcolor=bg.getpixel((0, 0)))
    # uneven light: a soft shadow across one side
    shade = Image.new("L", im.size, 0)
    sg = ImageDraw.Draw(shade)
    x0 = rng.randint(0, im.size[0] // 2)
    sg.rectangle([x0, 0, im.size[0], im.size[1]], fill=rng.randint(30, 70))
    shade = shade.filter(ImageFilter.GaussianBlur(120))
    im = Image.composite(Image.new("RGB", im.size, (0, 0, 0)), im, shade)
    im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.6, 1.4)))
    # sensor noise
    noise = Image.effect_noise(im.size, rng.uniform(8, 18)).convert("RGB")
    im = Image.blend(im, noise, 0.06)
    # phones downscale for upload
    scale = rng.uniform(0.55, 0.75)
    im = im.resize((int(im.size[0] * scale), int(im.size[1] * scale)), Image.BILINEAR)
    return im


# ---------------------------------------------------------------- data

EMPLOYERS = [
    ("Riverbend Grocery", "4410 Gravois Ave, St. Louis, MO 63116"),
    ("Gateway Home Care LLC", "812 Locust St, Kansas City, MO 64106"),
    ("Ozark Valley Diner", "19 Main St, Rolla, MO 65401"),
    ("Show-Me Warehouse Co.", "2200 Industrial Dr, Springfield, MO 65803"),
    ("Big River Laundry", "77 Front St, Hannibal, MO 63401"),
    ("Maplewood Pet Supply", "7300 Manchester Rd, Maplewood, MO 63143"),
]
PEOPLE = ["Dana Whitfield", "Marcus Lee", "Rosa Delgado", "Tasha Brooks", "Kevin Ortiz", "Lin Park", "Jamal Carter"]
ORGS = [
    ("Northside Community Pantry", "3120 N Grand Blvd, St. Louis, MO 63107", "sorting and handing out food boxes",
     "Grace Holloway", "Volunteer Coordinator", "(314) 555-0148"),
    ("Riverfront Literacy Project", "450 Main St, Kansas City, MO 64105", "tutoring adults in reading",
     "Samuel Okafor", "Program Director", "(816) 555-0193"),
    ("Hope Street Shelter", "18 Hope St, Columbia, MO 65201", "serving meals and cleaning the dining hall",
     "Ellen Varga", "Site Manager", "(573) 555-0110"),
]


def stub_fields(rng, employer, address, employee, start, hours, rate):
    gross = round(hours * rate, 2)
    end = start + timedelta(days=13)
    return {
        "employer": employer, "address": address, "employee": employee,
        "start": start, "end": end, "paydate": end + timedelta(days=6),
        "hours": hours, "rate": rate, "gross": gross,
        "ytd": round(gross * rng.randint(1, 20) + rng.randint(0, 999) / 100, 2),
    }


def stub_answer(f):
    return {"type": "pay_stub", "periodStart": iso(f["start"]), "periodEnd": iso(f["end"]),
            "hours": f["hours"], "gross": f["gross"]}


def gig_answer(f):
    return {"type": "gig_summary", "rangeStart": iso(f["start"]), "rangeEnd": iso(f["end"]),
            "earnings": f["earnings"], "activeMinutes": f["active_min"]}


def vol_answer(f):
    return {"type": "volunteer_letter", "org": f["org"], "periodStart": iso(f["start"]),
            "periodEnd": iso(f["end"]), "hours": f["hours"]}


def main():
    rng = random.Random(1129)
    samples = ROOT / "public/samples/dana"
    clean = ROOT / "bench/fixtures/clean"
    mess = ROOT / "bench/fixtures/messy"
    for p in (samples, clean, mess):
        p.mkdir(parents=True, exist_ok=True)

    # ---- Dana (January 2027). Totals: 58 h of work + volunteering, $636.40 pay.
    dana = {}
    s1 = stub_fields(rng, *EMPLOYERS[0], "Dana Whitfield", date(2027, 1, 3), 18.0, 15.0)
    s2 = stub_fields(rng, *EMPLOYERS[0], "Dana Whitfield", date(2027, 1, 17), 12.0, 15.0)
    s2["end"] = date(2027, 1, 30)
    s1["ytd"], s2["ytd"] = 270.0, 450.0
    stub_a(s1).save(samples / "pay-stub-jan-1.png")
    stub_c(s2).save(samples / "pay-stub-jan-2.png")
    dana["pay-stub-jan-1.png"] = stub_answer(s1)
    dana["pay-stub-jan-2.png"] = stub_answer(s2)
    v = dict(zip(["org", "address", "activity", "contact", "title", "phone"], ORGS[0]))
    v.update(volunteer="Dana Whitfield", start=date(2027, 1, 2), end=date(2027, 1, 30), hours=28,
             letterdate=date(2027, 2, 2))
    volunteer(v).save(samples / "volunteer-letter-jan.png")
    dana["volunteer-letter-jan.png"] = vol_answer(v)
    gf = dict(platform="QuickCart Driver", start=date(2027, 1, 1), end=date(2027, 1, 31), earnings=186.40,
              tips=41.25, deliveries=23, active_min=14 * 60 + 5, online_min=21 * 60 + 30)
    gig(gf).save(samples / "gig-summary-jan.png")
    dana["gig-summary-jan.png"] = gig_answer(gf)
    (samples / "answers.json").write_text(json.dumps(dana, indent=2))

    # ---- bench set
    answers = {}
    n = 0
    for i in range(18):
        emp, addr = rng.choice(EMPLOYERS)
        start = date(2026, 1, 4) + timedelta(days=14 * rng.randint(0, 30))
        hours = round(rng.choice([rng.randint(8, 40), rng.randint(8, 40) + rng.choice([0.25, 0.5, 0.75])]), 2)
        rate = rng.choice([13.75, 15.0, 15.5, 16.25, 17.0, 18.4, 21.0])
        f = stub_fields(rng, emp, addr, rng.choice(PEOPLE), start, hours, rate)
        im = STUBS[i % 3](f)
        name = f"stub-{i:02d}"
        im.save(clean / f"{name}.png")
        messy(im, rng).save(mess / f"{name}.jpg", quality=rng.randint(70, 88))
        answers[name] = stub_answer(f)
        n += 1
    for i in range(8):
        start = date(2026, 1, 5) + timedelta(days=7 * rng.randint(0, 60))
        span = rng.choice([6, 13, 30])
        active = rng.randint(180, 2400)
        f = dict(platform=rng.choice(["QuickCart Driver", "RouteRunner", "BasketGo"]), start=start,
                 end=start + timedelta(days=span), earnings=round(rng.uniform(60, 900), 2),
                 tips=round(rng.uniform(5, 120), 2), deliveries=rng.randint(4, 120),
                 active_min=active, online_min=active + rng.randint(30, 900))
        im = gig(f)
        name = f"gig-{i:02d}"
        im.save(clean / f"{name}.png")
        messy(im, rng).save(mess / f"{name}.jpg", quality=rng.randint(70, 88))
        answers[name] = gig_answer(f)
    for i in range(6):
        o = ORGS[i % 3]
        start = date(2026, rng.randint(1, 11), rng.randint(1, 5))
        f = dict(zip(["org", "address", "activity", "contact", "title", "phone"], o))
        f.update(volunteer=rng.choice(PEOPLE), start=start, end=start + timedelta(days=rng.randint(20, 28)),
                 hours=rng.choice([6, 10, 12, 16, 20, 24, 30, 36]), letterdate=start + timedelta(days=32))
        im = volunteer(f)
        name = f"vol-{i:02d}"
        im.save(clean / f"{name}.png")
        messy(im, rng).save(mess / f"{name}.jpg", quality=rng.randint(70, 88))
        answers[name] = vol_answer(f)
    (ROOT / "bench/fixtures/answers.json").write_text(json.dumps(answers, indent=2))
    print(f"dana: 4 docs; bench: {len(answers)} docs x (clean + messy)")


if __name__ == "__main__":
    main()
