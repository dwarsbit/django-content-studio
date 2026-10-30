import { describe, expect, it } from "vitest";

import { describeFile } from "@/components/media-library/file-meta";
import {
  describeMetadata,
  dimensionsOf,
  formatDuration,
  metadataOf,
} from "@/lib/media-metadata";
import type { MediaItem } from "@/types";

const item = {
  id: "1",
  name: "clip.mp4",
  type: "video",
  size: 2048,
  metadata: { width: 1920, height: 1080, duration: 72.4, frame_rate: 25 },
} as unknown as MediaItem;

describe("media metadata", () => {
  it("reads the metadata under the configured attribute", () => {
    expect(metadataOf(item, "metadata")).toEqual({
      width: 1920,
      height: 1080,
      duration: 72.4,
      frame_rate: 25,
    });
    expect(metadataOf(item, null)).toBeNull();
    expect(metadataOf(item, "missing")).toBeNull();
  });

  it("knows the dimensions only when both are numbers", () => {
    expect(dimensionsOf({ width: 10, height: 20 })).toEqual({
      width: 10,
      height: 20,
    });
    expect(dimensionsOf({ width: 10 })).toBeNull();
    expect(dimensionsOf(null)).toBeNull();
  });

  it("formats durations", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(72.4)).toBe("1:12");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("describes the metadata it knows", () => {
    expect(describeMetadata(metadataOf(item, "metadata"))).toBe(
      "1920 × 1080 px · 1:12 · 25 fps",
    );
    expect(describeMetadata({ duration: 5 })).toBe("0:05");
    expect(describeMetadata({ codec: "h264" })).toBe("");
    expect(describeMetadata(null)).toBe("");
  });

  it("adds the metadata to a file's meta line", () => {
    expect(describeFile(item, "Video", { width: 1920, height: 1080 })).toBe(
      "MP4 · 2KB · 1920 × 1080 px",
    );
    expect(describeFile(item, "Video")).toBe("MP4 · 2KB");
  });
});
