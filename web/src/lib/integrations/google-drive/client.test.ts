import { describe, expect, it } from "vitest";
import { driveRetryDelayMs, isDriveTimeout, readCappedBody, withDriveRetries } from "./client";

describe("withDriveRetries", () => {
  it("retries a Drive 502 and returns the later success", async () => {
    const seen: number[] = [];
    const res = await withDriveRetries(
      async () => {
        seen.push(seen.length);
        if (seen.length < 3) {
          return new Response("bad gateway", { status: 502 });
        }
        return new Response("ok", { status: 200 });
      },
      { sleep: async () => {}, random: () => 0 },
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("does not retry a 400", async () => {
    let calls = 0;
    const res = await withDriveRetries(
      async () => {
        calls += 1;
        return new Response("bad request", { status: 400 });
      },
      { sleep: async () => {}, random: () => 0 },
    );
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
  });

  it("does not retry a download timeout", async () => {
    let calls = 0;
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    await expect(
      withDriveRetries(
        async () => {
          calls += 1;
          throw timeout;
        },
        { sleep: async () => {}, random: () => 0, maxAttempts: 4 },
      ),
    ).rejects.toSatisfy(isDriveTimeout);
    expect(calls).toBe(1);
  });

  it("honors Retry-After on 503", async () => {
    const delays: number[] = [];
    const res = await withDriveRetries(
      async () => {
        if (delays.length === 0) {
          return new Response("unavailable", {
            status: 503,
            headers: { "retry-after": "1" },
          });
        }
        return new Response("ok", { status: 200 });
      },
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
        random: () => 0,
      },
    );
    expect(res.status).toBe(200);
    expect(delays).toEqual([1000]);
  });
});

describe("readCappedBody", () => {
  it("returns a small body and refuses one over the cap", async () => {
    const small = await readCappedBody(
      new Response(new Uint8Array([1, 2, 3])),
      4,
      "note.pdf",
    );
    expect(Buffer.from(small)).toEqual(Buffer.from([1, 2, 3]));

    await expect(
      readCappedBody(
        new Response(new Uint8Array(8), {
          headers: { "content-length": "8" },
        }),
        4,
        "meeting.m4a",
      ),
    ).rejects.toThrow(/sync limit/);
  });
});

describe("driveRetryDelayMs", () => {
  it("caps a long Retry-After", () => {
    const delay = driveRetryDelayMs(
      0,
      new Response("", { status: 429, headers: { "retry-after": "120" } }),
      () => 0,
    );
    expect(delay).toBe(2_000);
  });
});
