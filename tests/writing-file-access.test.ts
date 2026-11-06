import { describe, expect, it } from "vitest";
import {
  chooseSaveTarget,
  detectFileAccess,
  isAbortError,
  isWritableHandle,
} from "../src/writing/file-access";

const pickerSupport = {
  canOpenWithPicker: true,
  canSaveWithPicker: true,
};

const noPickerSupport = {
  canOpenWithPicker: false,
  canSaveWithPicker: false,
};

const writableHandle = {
  name: "报告.md",
  getFile: () => Promise.resolve(new File([""], "报告.md")),
  createWritable: () => Promise.reject(new Error("not used")),
};

describe("file capability fallback", () => {
  it("detects picker support in both directions", () => {
    expect(detectFileAccess({})).toEqual(noPickerSupport);
    expect(
      detectFileAccess({
        showOpenFilePicker: () => Promise.resolve([]),
        showSaveFilePicker: () => Promise.reject(new Error("unused")),
      }),
    ).toEqual(pickerSupport);
  });

  it("recognizes only handles that can create a writable stream", () => {
    expect(isWritableHandle(null)).toBe(false);
    expect(isWritableHandle({})).toBe(false);
    expect(isWritableHandle({ name: "a.md", createWritable() {} })).toBe(false);
    expect(isWritableHandle(writableHandle)).toBe(true);
  });

  it("prefers write-back, then the picker, then a download", () => {
    expect(chooseSaveTarget(writableHandle, pickerSupport)).toBe("handle");
    expect(chooseSaveTarget(writableHandle, noPickerSupport)).toBe("handle");
    expect(chooseSaveTarget(null, pickerSupport)).toBe("picker");
    expect(chooseSaveTarget({ createWritable: "no" }, pickerSupport)).toBe(
      "picker",
    );
    expect(chooseSaveTarget(null, noPickerSupport)).toBe("download");
    expect(chooseSaveTarget({}, noPickerSupport)).toBe("download");
  });

  it("separates a cancelled picker from a failed save", () => {
    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(true);
    expect(isAbortError(new DOMException("denied", "NotAllowedError"))).toBe(
      false,
    );
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError("AbortError")).toBe(false);
  });
});
