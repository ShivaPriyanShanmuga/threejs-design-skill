#!/usr/bin/env bash
#
# reference.sh <url|video|image> [options]
#
# Turns a reference into things you can actually look at: a contact sheet of the whole piece,
# full-resolution frames at chosen moments, and a palette in hex.
#
#   --at 1.7,4.2,7.0   seconds to pull full-resolution frames from (default: 5 evenly spaced)
#   --fps 3            contact sheet sampling rate (default 2)
#   --crop W:H:X:Y     crop before doing anything — screen recordings are usually letterboxed
#                      inside phone-shaped video with captions; crop to the browser window first
#   --out DIR          output directory (default .reference)
#
# Needs ffmpeg. Needs yt-dlp only for URLs (pip install yt-dlp).
#
# See references/working-from-references.md for what to do with the output. Short version:
# read the contact sheet before the frames, and note composition and lighting direction
# before worrying about the object itself.

set -euo pipefail

SRC="${1:-}"
[ -z "$SRC" ] && { echo "usage: reference.sh <url|video|image> [--at s,s] [--fps n] [--crop W:H:X:Y] [--out DIR]" >&2; exit 1; }
shift

AT=""
FPS=2
CROP=""
OUT=".reference"

while [ $# -gt 0 ]; do
  case "$1" in
    --at)   AT="$2"; shift 2 ;;
    --fps)  FPS="$2"; shift 2 ;;
    --crop) CROP="$2"; shift 2 ;;
    --out)  OUT="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found" >&2; exit 1; }
mkdir -p "$OUT"

# ---------------------------------------------------------------- fetch

if printf '%s' "$SRC" | grep -qE '^https?://'; then
  YTDLP="yt-dlp"
  command -v yt-dlp >/dev/null 2>&1 || YTDLP="python -m yt_dlp"
  $YTDLP --version >/dev/null 2>&1 || { echo "yt-dlp not found. pip install yt-dlp" >&2; exit 1; }
  echo "==> downloading"
  rm -f "$OUT"/source.*
  $YTDLP -q --no-warnings -f "bv*[height<=1080]+ba/b[height<=1080]/b" \
    -o "$OUT/source.%(ext)s" \
    --print-to-file "%(title)s | %(duration)ss | %(uploader)s | %(width)sx%(height)s" "$OUT/source.txt" \
    "$SRC"
  FILE=$(ls "$OUT"/source.* 2>/dev/null | grep -v '\.txt$' | head -1)
  [ -f "$OUT/source.txt" ] && { echo "    $(cat "$OUT/source.txt")"; }
else
  FILE="$SRC"
  [ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 1; }
fi

VF_CROP=""
# An array, not a string: "${VAR:+-vf \"x\"}" collapses into a single argument, and
# ffmpeg then sees one option literally called `vf crop=...`.
CROP_ARGS=()
if [ -n "$CROP" ]; then
  VF_CROP="crop=$CROP,"
  CROP_ARGS=(-vf "crop=$CROP")
fi

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FILE" 2>/dev/null | head -1 || true)
IS_VIDEO=0
case "${DUR:-}" in
  ''|N/A) IS_VIDEO=0 ;;
  *) awk "BEGIN{exit !($DUR > 0.05)}" && IS_VIDEO=1 ;;
esac

# ---------------------------------------------------------------- slice

if [ "$IS_VIDEO" = "1" ]; then
  echo "==> contact sheet (${DUR}s at ${FPS}fps)"
  rm -f "$OUT"/sheet_*.png
  ffmpeg -v error -i "$FILE" \
    -vf "${VF_CROP}fps=$FPS,scale=240:-1,tile=6x4:margin=6:padding=4:color=0x202020" \
    -an -y "$OUT/sheet_%02d.png"

  if [ -z "$AT" ]; then
    # Five evenly spaced moments, avoiding the very start and end.
    AT=$(awk -v d="$DUR" 'BEGIN{for(i=1;i<=5;i++){printf "%.2f%s", d*i/6, (i<5?",":"")}}')
  fi
  echo "==> frames at ${AT}s"
  rm -f "$OUT"/frame_*.png
  i=1
  IFS=','
  for t in $AT; do
    ffmpeg -v error -ss "$t" -i "$FILE" -frames:v 1 \
      ${CROP_ARGS[@]+"${CROP_ARGS[@]}"} -y "$OUT/frame_$(printf '%02d' $i)_${t}s.png"
    i=$((i+1))
  done
  unset IFS
  PAL_SRC=$(ls "$OUT"/frame_*.png | head -1)
else
  echo "==> still image"
  ffmpeg -v error -i "$FILE" ${CROP_ARGS[@]+"${CROP_ARGS[@]}"} -y "$OUT/frame_01.png"
  PAL_SRC="$OUT/frame_01.png"
fi

# ---------------------------------------------------------------- palette

# palettegen writes its real entries first and pads the rest of the 16x16 image, so
# counting frequency reports the padding as the dominant colour. Reading them in
# raster order instead gives the genuine light-to-dark ramp.
echo "==> palette"
ffmpeg -v error -i "$PAL_SRC" -vf "palettegen=max_colors=10:stats_mode=full" -y "$OUT/palette.png"
ffmpeg -v error -i "$OUT/palette.png" -f rawvideo -pix_fmt rgb24 - 2>/dev/null \
  | od -An -tu1 -v -w3 \
  | awk '{ printf "#%02X%02X%02X\n", $1, $2, $3 }' \
  | grep -v '^#00FF00$' | awk '!seen[$0]++' | head -10 \
  | awk '{ printf "    %s\n", $1 }' \
  | tee "$OUT/palette.txt"

# A 6x4 grid of block averages: where the colour actually sits in the frame, which is more
# useful for composition than a flat list of dominant hues.
echo "==> colour by region (6x4 grid, reading left to right, top to bottom)"
ffmpeg -v error -i "$PAL_SRC" -vf "scale=6:4:flags=area" -f rawvideo -pix_fmt rgb24 - 2>/dev/null \
  | od -An -tu1 -v -w18 \
  | awk '{ printf "   "; for (i = 1; i <= 18; i += 3) printf " #%02X%02X%02X", $i, $(i+1), $(i+2); printf "\n" }'

echo ""
echo "==> wrote $OUT/"
ls "$OUT" | sed 's/^/    /'
echo ""
echo "Read the contact sheet first: structure, then composition, then palette."
echo "See references/working-from-references.md."
