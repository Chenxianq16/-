"""Compress CET-6 speech audio for faster web playback."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import av


def transcode(source: Path, destination: Path, bitrate: int) -> None:
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.unlink(missing_ok=True)

    with av.open(str(source)) as input_container:
        input_stream = next(
            (stream for stream in input_container.streams if stream.type == "audio"),
            None,
        )
        if input_stream is None:
            raise RuntimeError(f"No audio stream in {source.name}")

        with av.open(str(temporary), mode="w", format="mp3") as output_container:
            output_stream = output_container.add_stream("libmp3lame", rate=22050)
            output_stream.layout = "mono"
            output_stream.bit_rate = bitrate

            resampler = av.AudioResampler(
                format="s16",
                layout="mono",
                rate=22050,
            )

            for frame in input_container.decode(input_stream):
                for resampled in resampler.resample(frame):
                    for packet in output_stream.encode(resampled):
                        output_container.mux(packet)

            for resampled in resampler.resample(None):
                for packet in output_stream.encode(resampled):
                    output_container.mux(packet)

            for packet in output_stream.encode(None):
                output_container.mux(packet)

    os.replace(temporary, destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--bitrate", type=int, default=48_000)
    parser.add_argument("--suffix", default=".mp3")
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    for source in args.files:
        destination = (
            source
            if args.replace
            else source.with_name(source.stem + f".optimized{args.suffix}")
        )
        before = source.stat().st_size
        transcode(source, destination, args.bitrate)
        after = destination.stat().st_size
        print(
            f"{source.name} -> {destination.name}: "
            f"{before / 1024 / 1024:.1f} MiB -> {after / 1024 / 1024:.1f} MiB"
        )


if __name__ == "__main__":
    main()
