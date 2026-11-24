# SKI PILOT V2.0
import flet as ft
import pandas as pd
import sqlite3, os, certifi
from pathlib import Path
from datetime import date
import unicodedata
import re

os.environ["SSL_CERT_FILE"] = certifi.where()

APP_DIR = Path.home() / "SKI_PILOT"
DB_PATH = APP_DIR / "ski_pilot.db"
APP_DIR.mkdir(exist_ok=True)

THEMES = {
    "Dark Blue": {"page":"#101B2A","panel":"#1B2B40","accent":"#35C6D0","text":"#F3F7FB", "muted":"#9AAABD", "border":"#40546B"},
    "Light": {"page":"#F2F5F8","panel":"#FFFFFF","accent":"#2476C7","text":"#172536", "muted":"#536477", "border":"#B8C5D2"},
    "Alpine Green": {"page":"#10231E","panel":"#1D382F","accent":"#64C99A","text":"#F1F8F4", "muted":"#A4C1B4", "border":"#49685C"},
    "Midnight Purple": {"page":"#19172B","panel":"#292442","accent":"#A78BFA","text":"#F7F4FF", "muted":"#B8B1D1", "border":"#554D75"},
}
STATIONS_FILE = "Ski_2026-27.xlsx"
SNOW_FILE = "Neige_stations_Savoie_Hte-Savoie_Isère.xlsx"

def station_key(value):
    """Normalise les noms pour relier les stations aux feuilles météo et scores."""
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", value.lower())

def calc_pts_low(alt, s1=1500, s2=1800):
    if alt is None: return 0
    return 1 if alt < s1 else (2 if alt < s2 else 3)

def calc_pts_high(alt, s1=2000, s2=2500):
    if alt is None: return 0
    return 1 if alt < s1 else (2 if alt < s2 else 3)

def calc_pts_size(km, s1=50, s2=150):
    if km is None: return 0
    return 1 if km < s1 else (2 if km <= s2 else 3)

DEFAULT_VILLAGE_SCORES = {
    "alpedhuez": 2, "larosiere": 2, "lesmenuires": 1, "valdisere": 1,
    "espacekillytignesvaldisere": 1, "espacekilly": 1, "peiseyvallandry": 2,
    "valthorens": 0, "montgenevre": 0, "avoriaz": 1, "bonnevalsurarc": 1,
    "tignes": 0, "les2alpes": 1, "lesarcs": 1, "aussois": 2, "latoussuire": 1,
    "saintfrancoislongchamp": 1, "flaine": 1, "leskarellis": 1, "valmeinier": 0,
    "valloire": 2, "valfrejus": 0, "saintsorlindarves": 0, "saintmartindebelleville": 1,
    "espacesanbernardo": 1, "lessybelles": 1, "sybelles": 1, "champagnyenvanoise": 1,
    "laplagne": 1, "legranddomaine": 1, "paradiski": 1, "serrechevaliervallee": 1,
    "brideslesbains": 2, "aurisenoisans": 2, "lecorbier": 1, "saintefoytarentaise": 0,
    "lagrave": 2, "meribel": 1, "lanorma": 1, "courchevel": 1, "argentiere": 1,
    "argentieregrandsmontets": 1, "montchavinlescoches": 1, "ozvaujany": 1,
    "les3vallees": 0, "chamonix": 1, "legrandmassif": 0, "orelle": 1, "lessaisies": 0,
    "puysaintvincent": 0, "les7laux": 2, "valcenis": 0, "chatel": 2,
    "lesgetsmorzine": 2, "lescontaminesmontjoiehauteluce": 2, "ozenoisans": 0,
    "laclusaz": 2, "lesportesdusoleil": 1, "domaineevasionmontblanc": 1,
    "saintgervaismontblanc": 1, "villardreculas": 0, "albiezmontrond": 2,
    "alpedugrandserre": 1, "chamrousse": 1, "pralognanlavanoise": 2, "villaroger": 0,
    "arechesbeaufort": 1, "morzine": 2, "espaceliberte": 1,
    "espacelibertechatellachapelledabondance": 1,
    "villagesdugrandmassif": 1, "villagesdugrandmassifcarrozsamoensmorillon": 1,
    "lecolletdallevard": 1, "valmorel": 0, "villarddelanscorrencon": 0,
    "megeve": 2, "saintnicolasdeveroce": 1, "espacediamant": 1,
    "lachapelledabondance": 1, "legrandbornand": 0, "manigod": 0,
    "prazdelyssommand": 1, "vallorcine": 0, "espacerocdenfer": 1,
    "hirmentazleshaberes": 1, "combloux": 1, "rocdenfer": 1, "abondance": 2,
    "coldornon": 1, "coldeporte": 1, "crestvoland": 1, "lagiettaz": 1,
    "notredamedebellecombe": 0, "autransmeaudreenvercors": 1,
    "prazsurarlyvaldarly": 0, "bernex": 1, "espacevaldarly": 0, "leshouches": 0,
    "thollonlesmemises": 0, "lesemnoz": 0, "lansenvercors": 0, "coldubarioz": 0,
    "lafeclaz": 0, "passyplainejoux": 0, "gresseenvercors": 0,
    "lasambuypaysdefaverges": 0, "aillonsmargeriaz": 0, "cordon": 0,
    "flumetsaintnicolaslachapelle": 0, "lereposoir": 0, "massifdesbrasses": 0,
    "saintpierredechartreuseleplanolet": 0
}

def auto_fill_scores(c):
    try:
        stations = c.execute("SELECT name, low_alt, high_alt, km, score_low, score_high, score_village, score_size, score_excel FROM station").fetchall()
        for r in stations:
            name, lo, hi, km, sl, sh, sv, ss, se = r
            k = station_key(name)
            new_sl = sl if (sl is not None and sl > 0) else calc_pts_low(lo)
            new_sh = sh if (sh is not None and sh > 0) else calc_pts_high(hi)
            new_sv = sv if (sv is not None) else DEFAULT_VILLAGE_SCORES.get(k, 0)
            new_ss = ss if (ss is not None and ss > 0) else calc_pts_size(km)
            new_se = se if (se is not None and se > 0) else (2 * (new_sl + new_sh) + new_sv + new_ss)
            if sl is None or sh is None or sv is None or ss is None or se is None:
                c.execute("""UPDATE station SET score_low=?, score_high=?, score_village=?, score_size=?, score_excel=? WHERE name=?""",
                          (new_sl, new_sh, new_sv, new_ss, new_se, name))
        c.commit()
    except Exception:
        pass

def safe_border(width=1, color=None):
    if not color:
        return None
    try:
        if hasattr(ft, "border") and hasattr(ft.border, "all") and callable(getattr(ft.border, "all", None)):
            return ft.border.all(width, color)
    except Exception:
        pass
    try:
        bs = getattr(ft, "BorderSide", None) or getattr(getattr(ft, "border", None), "BorderSide", None)
        b_cls = getattr(ft, "Border", None) or getattr(getattr(ft, "border", None), "Border", None)
        if bs and b_cls:
            side = bs(width, color)
            return b_cls(top=side, right=side, bottom=side, left=side)
    except Exception:
        pass
    return None

def safe_icon(name):
    for obj in [getattr(ft, "Icons", None), getattr(ft, "icons", None)]:
        if obj and hasattr(obj, name):
            return getattr(obj, name)
    return "star"

def safe_align(x=0, y=0):
    try:
        cls = getattr(ft, "Alignment", None) or getattr(getattr(ft, "alignment", None), "Alignment", None)
        if cls:
            return cls(x, y)
    except Exception:
        pass
    return None

def make_point_badge(pts, max_pts=3, p=None):
    if pts is None:
        return ft.Text("—", color=p.get("muted", "#9AAABD") if p else "#9AAABD")
    if pts == 3:
        bg, fg = "#164E3A", "#64C99A"  # Vert menthe
    elif pts == 2:
        bg, fg = "#4D3800", "#F59E0B"  # Ambre
    elif pts == 1:
        bg, fg = "#1E2E42", "#93C5FD"  # Bleu ardoise
    else:
        bg, fg = "#2B3645", "#9AAABD"
    return ft.Container(
        content=ft.Text(f"{pts} pts", size=10, weight=ft.FontWeight.BOLD, color=fg),
        bgcolor=bg, padding=ft.Padding(5, 2, 5, 2), border_radius=6, alignment=safe_align(0, 0)
    )

def make_rank_badge(rank, p=None):
    if rank == 1:
        bg, fg = "#4A3B00", "#FFD700"  # Or
        txt = "🥇 01"
    elif rank == 2:
        bg, fg = "#333A42", "#E2E8F0"  # Argent
        txt = "🥈 02"
    elif rank == 3:
        bg, fg = "#3D2411", "#F59E0B"  # Bronze
        txt = "🥉 03"
    else:
        bg = p.get("panel", "#1B2B40") if p else "#1B2B40"
        fg = p.get("accent", "#35C6D0") if p else "#35C6D0"
        txt = f"#{rank:02d}"
    return ft.Container(
        content=ft.Text(txt, size=11, weight=ft.FontWeight.BOLD, color=fg),
        bgcolor=bg, padding=ft.Padding(6, 2, 6, 2), border_radius=6, alignment=safe_align(0, 0)
    )

def make_kpi_card(title, value, subtitle, icon, accent_color, p):
    return ft.Container(
        content=ft.Row([
            ft.Container(
                content=ft.Icon(icon, size=24, color=accent_color),
                bgcolor=p["page"], border_radius=10, padding=8
            ),
            ft.Column([
                ft.Text(title, size=11, color=p.get("muted", p["text"]), weight=ft.FontWeight.W_500),
                ft.Text(value, size=15, weight=ft.FontWeight.BOLD, color=p["text"]),
                ft.Text(subtitle, size=10, color=accent_color if subtitle else p.get("muted", p["text"]))
            ], spacing=1, tight=True, expand=True)
        ], vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=10),
        bgcolor=p["panel"], padding=ft.Padding(12, 10, 12, 10), border_radius=12,
        border=safe_border(1, p["border"]), expand=True
    )

def build_top20_barchart(top20, p, wa=2, wv=1, ws=1, wp=1):
    """Barres horizontales empilées par critère — compatible Flet 1.1.2.
    Chaque segment = contribution colorée d'un critère (altitude, village, taille, prix).
    On voit d'un coup d'œil POURQUOI une station domine."""
    if not top20:
        return ft.Container(content=ft.Text("Aucune donnée disponible",
                                             color=p.get("muted", p["text"])))

    # Palette par critère (fixe, indépendante du thème)
    C = {
        "al": "#38BDF8",   # Altitude basse  — bleu ciel
        "ah": "#35C6D0",   # Altitude haute  — cyan
        "vl": "#64C99A",   # Village         — vert menthe
        "sz": "#A78BFA",   # Taille domaine  — violet
        "pr": "#F59E0B",   # Prix            — ambre
    }
    muted     = p.get("muted", p["text"])
    BAR_MAX_W = 290   # largeur max de la barre complète (px)
    BAR_H     = 14    # hauteur de chaque segment
    max_total = max(d["total"] for d in top20) or 1

    def seg(val, color):
        """Crée un segment de barre proportionnel."""
        if val <= 0:
            return []
        w = max(4, int(val / max_total * BAR_MAX_W))
        return [ft.Container(bgcolor=color, width=w, height=BAR_H, border_radius=2)]

    items = []
    for rank, d in enumerate(top20, 1):
        name = d["name"].split("(")[0].strip()
        if len(name) > 24:
            name = name[:23] + "…"
        total = d["total"]

        # Segments proportionnels à la contribution de chaque critère
        parts = (
            seg(wa * d["pts_low"],     C["al"]) +
            seg(wa * d["pts_high"],    C["ah"]) +
            seg(wv * d["pts_village"], C["vl"]) +
            seg(ws * d["pts_size"],    C["sz"]) +
            seg(wp * d["pts_price"],   C["pr"])
        )
        bar_row = ft.Row(parts, spacing=2,
                          vertical_alignment=ft.CrossAxisAlignment.CENTER)

        # Badge rang coloré
        if rank == 1:   rb, rf = "#4A3B00", "#FFD700"
        elif rank == 2: rb, rf = "#333A42", "#CBD5E1"
        elif rank == 3: rb, rf = "#3D2411", "#F59E0B"
        else:           rb, rf = p["page"], muted

        rank_b = ft.Container(
            content=ft.Text(f"#{rank:02d}", size=9,
                            weight=ft.FontWeight.BOLD, color=rf),
            bgcolor=rb, padding=ft.Padding(4, 1, 4, 1),
            border_radius=4, width=34)

        score_b = ft.Container(
            content=ft.Text(str(total), size=10,
                            weight=ft.FontWeight.BOLD, color=p["accent"]),
            padding=ft.Padding(6, 2, 6, 2), border_radius=5, width=32,
            border=safe_border(1, p["accent"]) if rank <= 3 else safe_border(1, p["border"]),
            alignment=safe_align(0, 0))

        name_box = ft.Container(
            content=ft.Text(name, size=10, color=p["text"],
                            weight=ft.FontWeight.BOLD if rank <= 3 else ft.FontWeight.W_500),
            width=152)

        items.append(ft.Row([
            rank_b,
            name_box,
            bar_row,
            ft.Container(expand=True),
            score_b,
        ], vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=6))

    # Légende des couleurs
    legend_items = [
        (C["al"], f"Alt. basse ×{wa}"),
        (C["ah"], f"Alt. haute ×{wa}"),
        (C["vl"], f"Village ×{wv}"),
        (C["sz"], f"Taille ×{ws}"),
        (C["pr"], f"Prix ×{wp}"),
    ]
    legend_parts = []
    for color, label in legend_items:
        legend_parts.append(ft.Container(bgcolor=color, width=9, height=9, border_radius=2))
        legend_parts.append(ft.Text(label, size=9, color=muted))
    legend_row = ft.Row(legend_parts, spacing=5, wrap=True)

    return ft.Container(
        content=ft.Column(
            [legend_row,
             ft.Divider(height=1, color=p.get("border", "#40546B"))] + items,
            spacing=5),
        padding=ft.Padding(10, 8, 10, 8),
        border_radius=10,
        bgcolor=p["page"]
    )

def build_snow_linechart(rows, p):
    """Courbe d'enneigement maison — 100 % compatible Flet 1.1.2.
    Rendu : barres verticales proportionnelles + légende min/max/dates."""
    if not rows:
        return ft.Container(content=ft.Text("Aucun relevé disponible pour cette période.",
                                             color=p.get("muted", p["text"])))

    # Sous-échantillonner pour ne garder ~80 points max (lisibilité)
    step = max(1, len(rows) // 80)
    sampled = rows[::step]

    vals    = [float(g) if g is not None else 0.0 for _, g, _ in sampled]
    freshs  = [float(f) if f is not None else 0.0 for _, _, f in sampled]
    dates   = [d for d, _, _ in sampled]

    max_v = max(vals) if vals else 0
    if max_v == 0:
        return ft.Container(content=ft.Text("Données manquantes (toutes à 0).",
                                             color=p.get("muted", p["text"])))

    CHART_H  = 120
    bar_w    = max(4, min(16, 920 // len(vals)))
    accent   = p["accent"]
    fresh_c  = "#38BDF8"   # bleu ciel pour la neige fraîche
    muted    = p.get("muted", p["text"])

    segments = []
    for v, f in zip(vals, freshs):
        h_ground = max(2, int((v / max_v) * CHART_H))
        # Barre neige fraîche par-dessus (si dispo)
        h_fresh  = max(0, int((f / max_v) * CHART_H)) if f > 0 else 0

        col_parts = []
        if h_fresh > 0:
            col_parts.append(ft.Container(bgcolor=fresh_c, width=bar_w, height=h_fresh,
                                           border_radius=2))
        col_parts.append(ft.Container(bgcolor=accent, width=bar_w,
                                       height=max(2, h_ground - h_fresh),
                                       border_radius=2))

        bar_col = ft.Column(col_parts,
                             horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                             spacing=0, tight=True)
        segments.append(bar_col)

    # Axe Y simplifié : max et moitié
    mid_v = max_v / 2
    y_axis = ft.Column([
        ft.Text(f"{max_v:.0f}", size=8, color=muted),
        ft.Container(expand=True),
        ft.Text(f"{mid_v:.0f}", size=8, color=muted),
        ft.Container(expand=True),
        ft.Text("0", size=8, color=muted),
    ], height=CHART_H, width=28, spacing=0)

    bars_row = ft.Row(segments,
                       vertical_alignment=ft.CrossAxisAlignment.END,
                       spacing=1, scroll=ft.ScrollMode.AUTO,
                       expand=True)

    date_first = dates[0][:7]  if dates else ""
    date_last  = dates[-1][:7] if dates else ""
    max_idx    = vals.index(max_v)
    max_date   = dates[max_idx][:10] if dates else ""

    legend = ft.Row([
        ft.Container(bgcolor=accent,  width=10, height=10, border_radius=2),
        ft.Text("Neige au sol", size=9, color=muted),
        ft.Container(bgcolor=fresh_c, width=10, height=10, border_radius=2),
        ft.Text("Fraîche", size=9, color=muted),
        ft.Container(expand=True),
        ft.Text(f"Max : {max_v:.0f} cm le {max_date}", size=9, color=accent, weight=ft.FontWeight.BOLD),
    ], spacing=6)

    return ft.Container(
        content=ft.Column([
            ft.Row([y_axis, bars_row], spacing=4,
                   vertical_alignment=ft.CrossAxisAlignment.END),
            ft.Row([
                ft.Text(date_first, size=8, color=muted),
                ft.Container(expand=True),
                ft.Text(date_last, size=8, color=muted),
            ]),
            legend,
        ], spacing=4),
        height=CHART_H + 60,
        padding=ft.Padding(6, 6, 6, 4),
        border_radius=10,
        bgcolor=p["page"]
    )

def connect():
    c = sqlite3.connect(DB_PATH)
    c.execute("""CREATE TABLE IF NOT EXISTS station(
      name TEXT PRIMARY KEY, kind TEXT, department TEXT, domain TEXT, travel TEXT,
      low_alt REAL, high_alt REAL, km REAL, adult REAL, child REAL, sixday REAL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS snow(
      station TEXT, day TEXT, season INTEGER, ground REAL, max_depth REAL, fresh REAL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS prefs(key TEXT PRIMARY KEY,value TEXT)""")
    # Migrations non destructives : les bases déjà créées restent utilisables.
    cols = {r[1] for r in c.execute("PRAGMA table_info(station)")}
    for name, typ in [("child6", "REAL"), ("obs_alt", "REAL"), ("travel_min", "INTEGER"), ("score_low", "REAL"), ("score_high", "REAL"), ("score_village", "REAL"), ("score_size", "REAL"), ("score_excel", "REAL")]:
        if name not in cols:
            c.execute(f"ALTER TABLE station ADD COLUMN {name} {typ}")
    snow_cols = {r[1] for r in c.execute("PRAGMA table_info(snow)")}
    if "obs_alt" not in snow_cols:
        c.execute("ALTER TABLE snow ADD COLUMN obs_alt REAL")
    c.commit()
    auto_fill_scores(c)
    return c

def num(v):
    try:
        return float(v) if pd.notna(v) else None
    except Exception:
        return None

def travel_minutes(v):
    if pd.isna(v): return None
    if hasattr(v, "hour"):
        return int(v.hour) * 60 + int(v.minute)
    s = str(v).strip().lower().replace(" ", "")
    m = __import__("re").search(r"(?:(\d+)\s*h)?(?:(\d+)\s*(?:min|m))?", s)
    if m and (m.group(1) or m.group(2)):
        return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)
    return None

def fmt_travel(v):
    n = travel_minutes(v)
    return f"{n//60}h{n%60:02d}" if n is not None else (str(v) if v else "—")

def import_workbooks(stations_path, snow_path):
    c = connect()
    # L'import remplace uniquement les données issues des classeurs.
    c.execute("DELETE FROM station")
    c.execute("DELETE FROM snow")
    st = pd.read_excel(stations_path, sheet_name="Stations", header=1)
    for _, r in st.iterrows():
        name = r.get("Station / domaine (lien plan des pistes)")
        if pd.isna(name): continue
        tr = r.get("Trajet depuis La Biolle")
        c.execute("""INSERT OR REPLACE INTO station
          (name,kind,department,domain,travel,low_alt,high_alt,km,adult,child,sixday,child6,travel_min)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (str(name), str(r.get("Type","") or ""), str(r.get("Département","") or ""),
           str(r.get("Domaine relié","") or ""), fmt_travel(tr),
           num(r.get("Alt. basse (m)")), num(r.get("Alt. haute (m)")),
           num(r.get("Km de pistes")), num(r.get("Jour adulte")), num(r.get("Jour enfant")),
           num(r.get("6 jours adulte")), num(r.get("6 jours enfant")), travel_minutes(tr)))
        c.execute("""UPDATE station SET score_low=?,score_high=?,score_village=?,score_size=?,score_excel=? WHERE name=?""",
          (num(r.get("Pts alt. basse")), num(r.get("Pts alt. haute")), num(r.get("Note village (0-2)")),
           num(r.get("Pts taille")), num(r.get("Score total")), str(name)))

    xls = pd.ExcelFile(snow_path)
    meta = {"Comparaison","Graphique","Classement","UNE station","Données","Légende","Neige fraîche","Couverture","Nb hivers"}
    weather_altitudes = {}
    for sheet in xls.sheet_names:
        if sheet in meta: continue
        try:
            # Altitude du poste météo : cellule B3 (ex. Orelle = 2356 m).
            try:
                meta_df = pd.read_excel(snow_path, sheet_name=sheet, header=None, nrows=3, usecols="A:B")
                obs_alt = num(meta_df.iloc[2, 1])
            except Exception:
                obs_alt = None
            weather_altitudes[station_key(sheet)] = obs_alt
            df = pd.read_excel(snow_path, sheet_name=sheet, header=5, usecols="A:E")
            df.columns = ["day","season","ground","max_depth","fresh"]
            df = df.dropna(subset=["day"])
            df["day"] = pd.to_datetime(df["day"], errors="coerce")
            df = df.dropna(subset=["day"])
            rows = []
            for _, r in df.iterrows():
                rows.append((sheet, r["day"].strftime("%Y-%m-%d"),
                    int(r["season"]) if pd.notna(r["season"]) else r["day"].year,
                    num(r["ground"]), num(r["max_depth"]), num(r["fresh"]), obs_alt))
            c.executemany("INSERT INTO snow(station,day,season,ground,max_depth,fresh,obs_alt) VALUES(?,?,?,?,?,?,?)", rows)
            c.execute("UPDATE station SET obs_alt=? WHERE name=?", (obs_alt, sheet))
        except Exception as e:
            print("Feuille ignorée:", sheet, e)

    # Rapprochement tolérant : accents, espaces et ponctuation (ex. Valfréjus / Val Fréjus).
    station_rows = c.execute("SELECT name FROM station").fetchall()
    for (station_name,) in station_rows:
        key = station_key(station_name)
        altitude = weather_altitudes.get(key)
        if altitude is None:
            # L'Alpe d'Huez est nommé sans article dans le classeur des stations.
            candidates = [v for k, v in weather_altitudes.items()
                          if k.lstrip("l") == key and v is not None]
            if candidates:
                altitude = candidates[0]
        if altitude is not None:
            c.execute("UPDATE station SET obs_alt=? WHERE name=?", (altitude, station_name))
    c.commit()
    c.close()

def main(page: ft.Page):
    page.title = "SKI PILOT – Tableau de bord"
    page.window.width = 1250
    page.window.height = 850
    theme_name = "Dark Blue"
    c = connect()
    row = c.execute("SELECT value FROM prefs WHERE key='theme'").fetchone()
    c.close()
    if row and row[0] in THEMES: theme_name = row[0]

    def palette(): return THEMES[theme_name]
    page.theme_mode = ft.ThemeMode.LIGHT if theme_name == "Light" else ft.ThemeMode.DARK
    status = ft.Text(size=12, color=palette()["text"])
    content = ft.Column(expand=True, scroll=ft.ScrollMode.AUTO, spacing=10)

    def panel(title, body):
        p = palette()
        return ft.Container(content=ft.Column([
            ft.Text(title, weight=ft.FontWeight.BOLD, size=15), body
        ], spacing=7), bgcolor=p["panel"], padding=12, border_radius=12, expand=True)

    def load_status():
        c = connect()
        n = c.execute("SELECT COUNT(*) FROM station").fetchone()[0]
        s = c.execute("SELECT COUNT(*) FROM snow").fetchone()[0]
        c.close()
        status.value = f"Base locale : {n} stations/domaines · {s:,} relevés quotidiens".replace(",", " ")
        status.color = palette()["text"]

    def refresh():
        p = palette()
        page.bgcolor = p["page"]
        page.theme_mode = ft.ThemeMode.LIGHT if theme_name == "Light" else ft.ThemeMode.DARK
        try:
            page.theme = ft.Theme(color_scheme_seed=p["accent"])
        except Exception:
            pass
        content.controls.clear()
        # En-tête compact avec badge de version V2.0
        theme = ft.Dropdown(label=None, value=theme_name, width=190,
            options=[ft.DropdownOption(key=x, text=x) for x in THEMES],
            on_select=change_theme)
        theme_block = ft.Column([
            ft.Text("Thème", size=10, color=p["text"]),
            theme
        ], spacing=1, tight=True)
        content.controls.append(ft.Container(
            content=ft.Row([
                ft.Row([
                    ft.Text("SKI PILOT", size=24, weight=ft.FontWeight.BOLD, color=p["accent"]),
                    ft.Container(
                        content=ft.Text("V2.0", size=10, weight=ft.FontWeight.BOLD, color="#FFFFFF"),
                        bgcolor=p["accent"], padding=ft.Padding(6, 2, 6, 2), border_radius=6
                    )
                ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Container(expand=True),
                ft.Text("Départ : La Biolle", color=p["text"], size=12),
                theme_block
            ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            padding=ft.Padding(0, 7, 0, 3)
        ))
        content.controls.append(ft.Container(content=status, bgcolor=p["panel"],
            padding=8, border_radius=8))
        tab_labels = [ft.Tab(label=x) for x in ["Classement neige","Stations","Historique","Mon classement","Import"]]
        tab_contents = [ranking_view(), stations_view(), history_view(), personal_ranking_view(), import_view()]
        tabs = ft.Tabs(length=5, selected_index=3, expand=True,
            content=ft.Column(expand=True, controls=[
                ft.TabBar(tabs=tab_labels),
                ft.TabBarView(expand=True, controls=tab_contents)
            ]))
        content.controls.append(tabs)
        page.update()

    def change_theme(e):
        nonlocal theme_name
        theme_name = e.control.value
        c = connect()
        c.execute("INSERT OR REPLACE INTO prefs VALUES('theme',?)", (theme_name,))
        c.commit(); c.close()
        refresh()

    def action_button(label, callback):
        # Bouton clair à fort contraste, y compris avec le thème Dark Blue.
        p = palette()
        return ft.Button(content=label, on_click=callback,
            bgcolor="#FFFFFF", color="#173047", style=ft.ButtonStyle(color="#173047"))

    def ranking_view():
        p0 = palette()
        d = ft.TextField(label="Date (AAAA-MM-JJ)", value="2025-12-22", width=175)
        week = ft.TextField(label="Semaine ISO", value="02", width=115)
        mode = ft.Dropdown(label="Période", value="Jour",
            options=[ft.DropdownOption(key=x,text=x) for x in ["Jour","Semaine ISO"]], width=145)
        metric = ft.Dropdown(label="Indicateur", value="Neige au sol",
            options=[ft.DropdownOption(key=x,text=x) for x in ["Neige au sol","Neige fraîche","Épaisseur maximale"]], width=190)
        results = ft.Column(spacing=4)

        def run(e=None):
            p = palette()
            col = {"Neige au sol":"ground","Neige fraîche":"fresh","Épaisseur maximale":"max_depth"}[metric.value]
            c = connect()
            if mode.value == "Jour":
                try: target = pd.to_datetime(d.value).strftime("%m-%d")
                except Exception:
                    results.controls = [ft.Text("Date invalide. Format attendu : AAAA-MM-JJ.")]
                    c.close(); page.update(); return
                rows = c.execute(f"""SELECT station,AVG({col}),COUNT(*),MAX(obs_alt)
                    FROM snow WHERE substr(day,6,5)=? AND {col} IS NOT NULL
                    GROUP BY station HAVING COUNT(*)>=1 ORDER BY 2 DESC LIMIT 20""", (target,)).fetchall()
            else:
                try: w = int(week.value)
                except Exception: w = 2
                raw = c.execute(f"SELECT station,day,{col},MAX(obs_alt) FROM snow WHERE {col} IS NOT NULL GROUP BY station,day").fetchall()
                c.close()
                frame = pd.DataFrame(raw, columns=["station","day","value","obs_alt"])
                if not frame.empty:
                    dates = pd.to_datetime(frame["day"], errors="coerce")
                    frame = frame[dates.dt.isocalendar().week.astype("Int64") == w]
                    rows = [(name,float(g.value.mean()),int(g.value.count()),g.obs_alt.dropna().max() if g.obs_alt.notna().any() else None)
                            for name,g in frame.groupby("station") if not g.empty]
                    rows = sorted(rows,key=lambda x:x[1],reverse=True)[:20]
                else: rows = []
            if mode.value == "Jour": c.close()

            results.controls.clear()
            if not rows:
                results.controls.append(ft.Text("Aucun relevé disponible pour cette période.", color=p.get("muted",p["text"])))
                page.update(); return

            max_v = max(v for _,v,_,_ in rows) or 1
            BAR_W = 340

            # KPI ligne du haut
            top_name, top_v, top_n, top_alt = rows[0]
            kpi1 = make_kpi_card("❄️ Record neige", f"{top_v:.0f} cm", top_name, safe_icon("AC_UNIT"), "#38BDF8", p)
            kpi2 = make_kpi_card("🏔 Altitude max", f"{int(top_alt)} m" if top_alt else "—", "Poste météo le plus haut", safe_icon("LANDSCAPE"), "#64C99A", p)
            kpi3 = make_kpi_card("📅 Stations classées", f"{len(rows)}", "avec données disponibles", safe_icon("DOWNHILL_SKIING"), p["accent"], p)
            results.controls.append(ft.Row([kpi1, kpi2, kpi3], spacing=10))
            results.controls.append(ft.Divider(height=1, color=p.get("border","#40546B")))

            # Lignes de classement avec barre de neige colorée
            for i,(name,v,n,alt) in enumerate(rows, 1):
                bar_w = max(6, int(v / max_v * BAR_W))
                snow_pct = v / max_v
                if snow_pct > 0.75:   bar_color = "#38BDF8"
                elif snow_pct > 0.5:  bar_color = "#7DD3FC"
                elif snow_pct > 0.25: bar_color = "#BAE6FD"
                else:                 bar_color = "#E0F2FE"

                if i == 1:   rb, rf, medal = "#4A3B00", "#FFD700", "🥇"
                elif i == 2: rb, rf, medal = "#333A42", "#CBD5E1", "🥈"
                elif i == 3: rb, rf, medal = "#3D2411", "#F59E0B", "🥉"
                else:        rb, rf, medal = p["panel"], p.get("muted",p["text"]), ""

                rank_b = ft.Container(
                    content=ft.Text(f"{medal}#{i:02d}", size=10, weight=ft.FontWeight.BOLD, color=rf),
                    bgcolor=rb, padding=ft.Padding(5,2,5,2), border_radius=5, width=50)
                snow_bar = ft.Container(bgcolor=bar_color, width=bar_w, height=12, border_radius=3)
                val_text = ft.Text(f"{v:.1f} cm", size=11, weight=ft.FontWeight.BOLD,
                                   color="#38BDF8" if i<=3 else p["text"], width=72)
                alt_b = ft.Container(
                    content=ft.Text(f"⛰ {int(alt)} m" if alt else "—", size=9, color=p.get("muted",p["text"])),
                    padding=ft.Padding(4,1,4,1), border_radius=4, bgcolor=p["page"], width=75)
                rel_b = ft.Container(
                    content=ft.Text(f"{n} rel.", size=9, color=p.get("muted",p["text"])),
                    padding=ft.Padding(4,1,4,1), border_radius=4, bgcolor=p["page"], width=55)

                row_bg = p["panel"] if i % 2 == 0 else p["page"]
                results.controls.append(ft.Container(
                    content=ft.Row([
                        rank_b,
                        ft.Container(content=ft.Text(name, size=11,
                            weight=ft.FontWeight.BOLD if i<=3 else ft.FontWeight.W_500,
                            color=p["text"]), width=190),
                        ft.Row([snow_bar, val_text], spacing=6,
                               vertical_alignment=ft.CrossAxisAlignment.CENTER, expand=True),
                        alt_b, rel_b,
                    ], vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                    bgcolor=row_bg, padding=ft.Padding(8,5,8,5), border_radius=8
                ))
            page.update()

        return ft.Column([
            ft.Text("Classement historique par date ou semaine", size=18, weight=ft.FontWeight.BOLD,
                    color=p0["text"]),
            ft.Row([mode,d,week,metric,action_button("Calculer le TOP 20",run)],wrap=True),
            results
        ],scroll=ft.ScrollMode.AUTO,spacing=8)

    def stations_view():
        c = connect()
        rows = c.execute("""SELECT name,department,travel,low_alt,high_alt,km,adult,child,obs_alt,travel_min
            FROM station WHERE name IS NOT NULL AND TRIM(name)!=''
            AND lower(name) NOT LIKE '%bleu =%' AND lower(name) NOT LIKE '%vert =%'
            AND lower(name) NOT LIKE '%valeur saisie%' ORDER BY name""").fetchall()
        c.close()
        search = ft.TextField(label="Rechercher une station", width=240)
        sortby = ft.Dropdown(label="Trier par", value="Nom",
            options=[ft.DropdownOption(key=x,text=x) for x in
                ["Nom","Prix adulte","Prix enfant","Temps trajet","Km pistes","Altitude haute","Altitude poste météo"]],
            width=190)
        order = ft.Dropdown(label="Ordre", value="Croissant",
            options=[ft.DropdownOption(key="Croissant",text="Croissant"),
                     ft.DropdownOption(key="Décroissant",text="Décroissant")],width=145)
        table = ft.Column(spacing=2)
        def fill(e=None):
            term = (search.value or "").lower()
            data = [r for r in rows if term in str(r[0]).lower()]
            idx = {"Nom":0,"Temps trajet":9,"Altitude haute":4,"Km pistes":5,"Prix adulte":6,"Prix enfant":7,"Altitude poste météo":8}[sortby.value]
            data.sort(key=lambda r: (r[idx] is None, str(r[idx]).lower() if idx==0 else (r[idx] if r[idx] is not None else 0)),
                      reverse=(order.value=="Décroissant"))
            table.controls.clear()
            for r in data:
                name,dep,tr,lo,hi,km,adult,child,obs,mins = r
                table.controls.append(ft.Row([
                    ft.Text(name,expand=True),
                    ft.Text(str(dep or "—"),width=60),
                    ft.Text(fmt_travel(tr),width=65),
                    ft.Text(f"{int(lo) if lo is not None else '—'}–{int(hi) if hi is not None else '—'} m",width=105),
                    ft.Text(f"{int(obs)} m" if obs is not None else "—",width=90),
                    ft.Text(f"{int(km)} km" if km is not None else "—",width=75),
                    ft.Text(f"{adult:g} €" if adult is not None else "—",width=75),
                    ft.Text(f"{child:g} €" if child is not None else "—",width=75)
                ]))
            page.update()
        search.on_change = fill
        sortby.on_select = fill
        order.on_select = fill
        fill()
        header = ft.Row([
            ft.Text("Station / domaine",expand=True), ft.Text("Dépt.",width=60),
            ft.Text("Trajet",width=65), ft.Text("Altitudes ski",width=105),
            ft.Text("Poste météo",width=90), ft.Text("Pistes",width=75),
            ft.Text("Adulte",width=75), ft.Text("Enfant",width=75)
        ])
        return ft.Column([
            ft.Text("Stations et domaines importés",size=18,weight=ft.FontWeight.BOLD),
            ft.Row([search,sortby,order],wrap=True),
            header, table
        ],scroll=ft.ScrollMode.AUTO,spacing=6)

    def history_view():
        c = connect()
        stations = [x[0] for x in c.execute("SELECT DISTINCT station FROM snow ORDER BY station").fetchall()]
        c.close()
        pick = ft.Dropdown(label="Station", options=[ft.DropdownOption(key=x, text=x) for x in stations],
            value=stations[0] if stations else None, width=260)
        start = ft.TextField(label="Début (AAAA-MM-JJ)", value="2025-12-01", width=165)
        end = ft.TextField(label="Fin (AAAA-MM-JJ)", value="2026-04-30", width=165)
        result = ft.Column(spacing=8)

        def show(e=None):
            p = palette()
            c = connect()
            row = c.execute("SELECT MAX(obs_alt) FROM snow WHERE station=?", (pick.value,)).fetchone()
            alt = row[0] if row else None
            rows = c.execute("SELECT day,ground,fresh FROM snow WHERE station=? AND day BETWEEN ? AND ? ORDER BY day",
                (pick.value, start.value, end.value)).fetchall()
            c.close()

            result.controls.clear()
            if not rows:
                result.controls.append(ft.Text("Aucun relevé trouvé pour cette station et cette période.", color=p.get("muted", p["text"])))
                page.update()
                return

            max_ground = 0
            max_day = "—"
            total_fresh = 0
            count_days = len(rows)
            for d, g, f in rows:
                if g is not None and g > max_ground:
                    max_ground = g
                    max_day = d
                if f is not None:
                    total_fresh += f

            kpi_alt = make_kpi_card("Altitude poste météo", f"{int(alt)} m" if alt is not None else "—", pick.value, safe_icon("LANDSCAPE"), p["accent"], p)
            kpi_max = make_kpi_card("Neige au sol max", f"{max_ground:g} cm", f"le {max_day}", safe_icon("AC_UNIT"), "#64C99A", p)
            kpi_fresh = make_kpi_card("Cumul de fraîche", f"{total_fresh:g} cm", f"sur {count_days} jours", safe_icon("CLOUD"), "#38BDF8", p)
            kpis_row = ft.Row([kpi_alt, kpi_max, kpi_fresh], spacing=10)

            chart_container = ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Text(f"📈 Courbe d'enneigement au sol (cm) – {pick.value}", weight=ft.FontWeight.BOLD, size=13, color=p["text"]),
                        ft.Container(expand=True),
                        ft.Text("Évolution quotidienne de l'épaisseur du manteau neigeux", size=11, color=p.get("muted", p["text"]))
                    ]),
                    build_snow_linechart(rows, p)
                ], spacing=6),
                bgcolor=p["panel"], padding=12, border_radius=12, border=safe_border(1, p["border"])
            )

            table_rows = ft.Column(spacing=2)
            for day, g, f in rows[-50:]:
                table_rows.controls.append(ft.Row([
                    ft.Text(day, width=105, color=p["text"]),
                    ft.Text(f"{g:g} cm" if g is not None else "—", expand=True, color=p["text"], weight=ft.FontWeight.BOLD),
                    ft.Text(f"{f:g} cm" if f is not None else "—", width=110, color=p.get("muted", p["text"]))
                ]))

            detail_container = ft.Container(
                content=ft.Column([
                    ft.Text("Derniers relevés quotidiens enregistrés", weight=ft.FontWeight.BOLD, size=13, color=p["text"]),
                    ft.Row([ft.Text("Date", width=105, weight=ft.FontWeight.BOLD), ft.Text("Neige au sol", expand=True, weight=ft.FontWeight.BOLD), ft.Text("Fraîche", width=110, weight=ft.FontWeight.BOLD)]),
                    table_rows
                ], spacing=6),
                bgcolor=p["panel"], padding=12, border_radius=12, border=safe_border(1, p["border"])
            )

            result.controls.extend([kpis_row, chart_container, detail_container])
            page.update()

        return ft.Column([
            ft.Text("Historique quotidien & Courbe d'enneigement", size=18, weight=ft.FontWeight.BOLD, color=palette()["text"]),
            ft.Row([pick, start, end, action_button("Afficher la courbe", show)], wrap=True),
            result
        ], scroll=ft.ScrollMode.AUTO, spacing=8)

    def personal_ranking_view():
        c = connect()
        rows = c.execute("""SELECT name,travel,low_alt,high_alt,km,adult,score_low,score_high,
            score_village,score_size,score_excel,travel_min,department FROM station
            WHERE name IS NOT NULL AND TRIM(name)!=''
            AND lower(name) NOT LIKE '%bleu =%' AND lower(name) NOT LIKE '%vert =%'
            AND lower(name) NOT LIKE '%valeur saisie%' ORDER BY name""").fetchall()
        c.close()

        priced = sorted([(r[0], r[5]) for r in rows if r[5] is not None], key=lambda x: x[1])
        price_scores = {}
        count = len(priced)
        for idx, (name, price) in enumerate(priced):
            tier = min(2, int(idx * 3 / max(count, 1)))
            price_scores[name] = 3 - tier

        station_data = []
        max_alt_overall = 0
        max_km_overall = 0
        total_price = 0
        count_price = 0
        for r in rows:
            name, tr, lo, hi, km, adult, sl, sh, sv, ss, se, tr_min, dep = r
            k = station_key(name)
            pts_lo = int(sl) if (sl is not None and sl > 0) else calc_pts_low(lo)
            pts_hi = int(sh) if (sh is not None and sh > 0) else calc_pts_high(hi)
            pts_v = int(sv) if sv is not None else DEFAULT_VILLAGE_SCORES.get(k, 0)
            pts_sz = int(ss) if (ss is not None and ss > 0) else calc_pts_size(km)
            pts_p = price_scores.get(name, 0)

            if hi and hi > max_alt_overall: max_alt_overall = int(hi)
            if km and km > max_km_overall: max_km_overall = int(km)
            if adult:
                total_price += adult
                count_price += 1

            station_data.append({
                "name": name, "department": dep or "", "travel": tr,
                "travel_min": tr_min if tr_min is not None else 9999,
                "low_alt": lo, "high_alt": hi, "km": km, "adult": adult,
                "pts_low": pts_lo, "pts_high": pts_hi, "pts_village": pts_v,
                "pts_size": pts_sz, "pts_price": pts_p, "score_excel": se
            })

        avg_price = (total_price / count_price) if count_price else 0

        w_alt = ft.Dropdown(label="Poids Altitude", value="2",
            options=[ft.DropdownOption(key=str(i), text=f"x{i}") for i in range(6)], width=120)
        w_village = ft.Dropdown(label="Poids Village", value="1",
            options=[ft.DropdownOption(key=str(i), text=f"x{i}") for i in range(6)], width=120)
        w_size = ft.Dropdown(label="Poids Taille", value="1",
            options=[ft.DropdownOption(key=str(i), text=f"x{i}") for i in range(6)], width=120)
        w_price = ft.Dropdown(label="Poids Prix", value="1",
            options=[ft.DropdownOption(key=str(i), text=f"x{i}") for i in range(6)], width=120)

        sortby = ft.Dropdown(label="Trier par", value="Score Total",
            options=[
                ft.DropdownOption(key="Score Total", text="Score Total"),
                ft.DropdownOption(key="Altitude (points)", text="Altitude (points)"),
                ft.DropdownOption(key="Altitude haute (m)", text="Altitude haute (m)"),
                ft.DropdownOption(key="Village (note)", text="Village (note)"),
                ft.DropdownOption(key="Taille (km)", text="Taille (km)"),
                ft.DropdownOption(key="Prix (€)", text="Prix (€)"),
                ft.DropdownOption(key="Temps trajet", text="Temps trajet"),
                ft.DropdownOption(key="Nom", text="Nom"),
            ], width=175)

        order = ft.Dropdown(label="Ordre", value="Décroissant",
            options=[
                ft.DropdownOption(key="Décroissant", text="Décroissant"),
                ft.DropdownOption(key="Croissant", text="Croissant")
            ], width=135)

        search = ft.TextField(label="Filtrer une station", width=200)

        show_chart = True

        def toggle_chart(e=None):
            nonlocal show_chart
            show_chart = not show_chart
            chart_container.visible = show_chart
            chart_toggle_btn.content = "📊 Masquer Graphique" if show_chart else "📊 Afficher Graphique TOP 20"
            page.update()

        chart_toggle_btn = ft.Button(content="📊 Masquer Graphique", on_click=toggle_chart,
            bgcolor="#FFFFFF", color="#173047", style=ft.ButtonStyle(color="#173047"))

        def reset_weights(e):
            w_alt.value = "2"
            w_village.value = "1"
            w_size.value = "1"
            w_price.value = "1"
            sortby.value = "Score Total"
            order.value = "Décroissant"
            search.value = ""
            render()

        reset_btn = ft.Button(content="Rétablir défauts", on_click=reset_weights,
            bgcolor="#FFFFFF", color="#173047", style=ft.ButtonStyle(color="#173047"))

        kpi_row = ft.Row(spacing=10)

        chart_container = ft.Container(
            bgcolor=palette()["panel"], padding=12, border_radius=12,
            border=safe_border(1, palette()["border"])
        )

        formula_text = ft.Text(size=12)
        table = ft.Column(spacing=3)

        header = ft.Row([
            ft.Text("Rang", width=65, weight=ft.FontWeight.BOLD),
            ft.Text("Station / domaine", expand=True, weight=ft.FontWeight.BOLD),
            ft.Text("Trajet", width=70, weight=ft.FontWeight.BOLD),
            ft.Text("Alt. basse", width=115, weight=ft.FontWeight.BOLD),
            ft.Text("Alt. haute", width=115, weight=ft.FontWeight.BOLD),
            ft.Text("Village", width=65, weight=ft.FontWeight.BOLD),
            ft.Text("Taille", width=105, weight=ft.FontWeight.BOLD),
            ft.Text("Prix jour", width=110, weight=ft.FontWeight.BOLD),
            ft.Text("Score Total", width=95, weight=ft.FontWeight.BOLD)
        ])

        def render(e=None):
            p = palette()
            wa = int(w_alt.value or 2)
            wv = int(w_village.value or 1)
            ws = int(w_size.value or 1)
            wp = int(w_price.value or 1)

            formula_text.value = (
                f"Formule en direct : Total = {wa} × (Alt. basse + Alt. haute) + {wv} × Village + {ws} × Taille + {wp} × Prix   "
                f"(Poids : Alt x{wa}, Village x{wv}, Taille x{ws}, Prix x{wp})"
            )
            formula_text.color = p.get("muted", p["text"])

            term = (search.value or "").strip().lower()
            computed = []
            for d in station_data:
                if term and term not in d["name"].lower():
                    continue
                tot = (
                    wa * (d["pts_low"] + d["pts_high"]) +
                    wv * d["pts_village"] +
                    ws * d["pts_size"] +
                    wp * d["pts_price"]
                )
                computed.append({**d, "total": tot})

            s_val = sortby.value
            is_desc = (order.value == "Décroissant")

            if s_val == "Score Total":
                computed.sort(key=lambda x: (x["total"], -(x["travel_min"] if x["travel_min"] is not None else 9999)), reverse=is_desc)
            elif s_val == "Altitude (points)":
                computed.sort(key=lambda x: (x["pts_low"] + x["pts_high"], x["high_alt"] or 0), reverse=is_desc)
            elif s_val == "Altitude haute (m)":
                computed.sort(key=lambda x: (x["high_alt"] is not None, x["high_alt"] or 0), reverse=is_desc)
            elif s_val == "Village (note)":
                computed.sort(key=lambda x: (x["pts_village"], x["total"]), reverse=is_desc)
            elif s_val == "Taille (km)":
                computed.sort(key=lambda x: (x["km"] is not None, x["km"] or 0), reverse=is_desc)
            elif s_val == "Prix (€)":
                computed.sort(key=lambda x: (x["adult"] is None, x["adult"] if x["adult"] is not None else 9999), reverse=is_desc)
            elif s_val == "Temps trajet":
                computed.sort(key=lambda x: (x["travel_min"] is None, x["travel_min"] if x["travel_min"] is not None else 9999), reverse=is_desc)
            elif s_val == "Nom":
                computed.sort(key=lambda x: x["name"].lower(), reverse=is_desc)

            kpi_row.controls.clear()
            leader = computed[0] if computed else None
            kpi_lead = make_kpi_card(
                "Leader du classement",
                leader["name"] if leader else "—",
                f"{leader['total']} pts · {fmt_travel(leader['travel'])}" if leader else "",
                safe_icon("EMOJI_EVENTS"), "#FFD700", p
            )
            kpi_alt = make_kpi_card("Altitude max", f"{max_alt_overall} m", "Sommet le plus haut", safe_icon("LANDSCAPE"), "#64C99A", p)
            kpi_km = make_kpi_card("Domaine max", f"{max_km_overall} km", "Plus grand domaine", safe_icon("DOWNHILL_SKIING"), p["accent"], p)
            kpi_pr = make_kpi_card("Prix jour moyen", f"{avg_price:.1f} €", f"{len(station_data)} stations", safe_icon("EURO"), "#38BDF8", p)
            kpi_row.controls.extend([kpi_lead, kpi_alt, kpi_km, kpi_pr])

            top20 = computed[:20]
            chart_container.content = ft.Column([
                ft.Row([
                    ft.Text("📊 TOP 20 – Comparatif des scores en direct", weight=ft.FontWeight.BOLD, size=13, color=p["text"]),
                    ft.Container(expand=True),
                    ft.Text(f"Podium : 1. {top20[0]['name']} ({top20[0]['total']}p)   2. {top20[1]['name']} ({top20[1]['total']}p)   3. {top20[2]['name']} ({top20[2]['total']}p)" if len(top20)>=3 else "", size=11, color=p["accent"])
                ]),
                build_top20_barchart(top20, p, wa, wv, ws, wp)
            ], spacing=6)

            table.controls.clear()
            for rank, d in enumerate(computed, 1):
                lo_widget = ft.Row([
                    ft.Text(f"{int(d['low_alt'])} m" if d['low_alt'] is not None else "—", size=12, color=p["text"]),
                    make_point_badge(d['pts_low'], 3, p)
                ], spacing=4)
                hi_widget = ft.Row([
                    ft.Text(f"{int(d['high_alt'])} m" if d['high_alt'] is not None else "—", size=12, color=p["text"]),
                    make_point_badge(d['pts_high'], 3, p)
                ], spacing=4)
                v_widget = ft.Container(
                    content=ft.Text(f"{d['pts_village']} / 2", size=11, color=p["text"])
                )
                sz_widget = ft.Row([
                    ft.Text(f"{int(d['km'])} km" if d['km'] is not None else "—", size=12, color=p["text"]),
                    make_point_badge(d['pts_size'], 3, p)
                ], spacing=4)
                pr_widget = ft.Row([
                    ft.Text(f"{d['adult']:g} €" if d['adult'] is not None else "—", size=12, color=p["text"]),
                    make_point_badge(d['pts_price'], 3, p)
                ], spacing=4)

                tot_badge = ft.Container(
                    content=ft.Text(f"{d['total']}", size=12, weight=ft.FontWeight.BOLD, color=p["accent"]),
                    bgcolor=p["panel"], padding=ft.Padding(10, 4, 10, 4), border_radius=8,
                    border=safe_border(1, p["accent"]) if rank <= 3 else safe_border(1, p["border"]),
                    alignment=safe_align(0, 0)
                )

                table.controls.append(ft.Row([
                    ft.Container(content=make_rank_badge(rank, p), width=65),
                    ft.Text(d["name"], expand=True, color=p["text"], weight=ft.FontWeight.W_500 if rank > 3 else ft.FontWeight.BOLD),
                    ft.Text(fmt_travel(d["travel"]), width=70, color=p["text"]),
                    ft.Container(content=lo_widget, width=115),
                    ft.Container(content=hi_widget, width=115),
                    ft.Container(content=v_widget, width=65),
                    ft.Container(content=sz_widget, width=105),
                    ft.Container(content=pr_widget, width=110),
                    ft.Container(content=tot_badge, width=95)
                ], vertical_alignment=ft.CrossAxisAlignment.CENTER))

            if not computed:
                table.controls.append(ft.Text("Aucune station ne correspond à votre recherche.", color=p.get("muted", p["text"])))
            page.update()

        w_alt.on_select = render
        w_village.on_select = render
        w_size.on_select = render
        w_price.on_select = render
        sortby.on_select = render
        order.on_select = render
        search.on_change = render

        render()

        controls_row1 = ft.Row([w_alt, w_village, w_size, w_price, reset_btn, chart_toggle_btn], vertical_alignment=ft.CrossAxisAlignment.CENTER, wrap=True)
        controls_row2 = ft.Row([sortby, order, search], vertical_alignment=ft.CrossAxisAlignment.CENTER, wrap=True)

        return ft.Column([
            ft.Text("Mon classement personnalisé (V2.0 – Tableau de bord interactif)", size=18, weight=ft.FontWeight.BOLD, color=palette()["text"]),
            kpi_row,
            ft.Container(
                content=ft.Column([controls_row1, controls_row2, formula_text], spacing=6),
                bgcolor=palette()["panel"], padding=10, border_radius=10, border=safe_border(1, palette()["border"])
            ),
            chart_container,
            header,
            table
        ], scroll=ft.ScrollMode.AUTO, spacing=8)

    def import_view():
        s = ft.TextField(label="Chemin du fichier Ski_2026-27.xlsx",value=str(Path.cwd()/STATIONS_FILE))
        n = ft.TextField(label="Chemin du fichier neige",value=str(Path.cwd()/SNOW_FILE))
        msg = ft.Text("Sélectionne les deux classeurs Excel à importer.")
        def do_import(e):
            try:
                import_workbooks(s.value,n.value)
                load_status()
                msg.value = "Import terminé. Les stations, tarifs et relevés météo sont actualisés."
            except Exception as ex:
                msg.value = f"Erreur d'import : {ex}"
            page.update()
        return ft.Column([
            ft.Text("Importer / actualiser les données",size=18,weight=ft.FontWeight.BOLD),
            s,n,ft.Button(content="Importer les deux fichiers",icon=safe_icon("UPLOAD_FILE"),on_click=do_import),
            msg
        ],spacing=8)

    page.add(content)
    load_status()
    refresh()

archive_flet = Path.home() / "Downloads" / "flet-windows.zip"
if not archive_flet.exists():
    raise FileNotFoundError(f"Archive Flet introuvable : {archive_flet}")
os.environ["FLET_CLIENT_URL"] = archive_flet.as_uri()
print("Archive Flet locale :", archive_flet)
ft.run(main)
