import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from "sonner";
import AnalysisTabs, {
  formatImprovements,
  sortImprovements,
} from "@/components/analysis-tabs";
import type { ResumeAnalysisResponse } from "@/lib/schemas";

const mockedToast = vi.mocked(toast);

// Fixture: valid ResumeAnalysisResponse with unsorted improvements
const SUMMARY =
  "Experienced engineer with 5 years building scalable web apps. Passionate about performance and accessibility. Proven track record shipping products end-to-end.";

const JOB_TITLES = ["Frontend Engineer", "Full-Stack Developer", "UI Engineer"];

const IMPROVEMENTS_UNSORTED = [
  {
    priority: "medium" as const,
    text: "Add more metrics to quantify impact in past roles, e.g., performance gains and user growth numbers.",
  },
  {
    priority: "low" as const,
    text: "Consider adding a brief section on open-source contributions and community involvement to stand out.",
  },
  {
    priority: "high" as const,
    text: "Tailor your resume summary to highlight leadership experience and key achievements clearly for recruiters.",
  },
];

const FIXTURE: ResumeAnalysisResponse = {
  summary: SUMMARY,
  jobTitles: JOB_TITLES,
  improvements: IMPROVEMENTS_UNSORTED,
};

function mockClipboardSuccess() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, {
    clipboard: { writeText },
  });
  return writeText;
}

function mockClipboardReject() {
  const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
  Object.assign(navigator, {
    clipboard: { writeText },
  });
  return writeText;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClipboardSuccess();
});

afterEach(() => {
  cleanup();
});

describe("AnalysisTabs – rendering tabs and content", () => {
  it("renders Summary, Job Titles, and Improvements tabs", () => {
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].textContent).toMatch(/Summary/i);
    expect(tabs[1].textContent).toMatch(/Job Titles/i);
    expect(tabs[2].textContent).toMatch(/Improvements/i);
  });

  it("shows summary text", () => {
    render(<AnalysisTabs data={FIXTURE} />);
    expect(screen.getByText(SUMMARY)).toBeTruthy();
  });

  it("shows job-title chips and count badge after switching to Job Titles tab", async () => {
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    const jobTitlesTab = tabs.find((t) => /Job Titles/i.test(t.textContent ?? ""));
    expect(jobTitlesTab).toBeTruthy();
    fireEvent.click(jobTitlesTab!);

    await waitFor(() => {
      expect(screen.getByText(JOB_TITLES[0])).toBeTruthy();
    });

    for (const title of JOB_TITLES) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    // count badge
    const badge = screen.getByLabelText(`${JOB_TITLES.length} suggested titles`);
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain(String(JOB_TITLES.length));

    // list semantics
    const list = screen.getByLabelText("Suggested job titles");
    expect(list).toBeTruthy();
    expect(list.tagName.toLowerCase()).toBe("ul");
  });

  it("renders priority badges in sorted order high -> medium -> low", async () => {
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    const improvementsTab = tabs.find((t) => /Improvements/i.test(t.textContent ?? ""));
    fireEvent.click(improvementsTab!);

    await waitFor(() => {
      expect(screen.getByTestId("priority-badge-high")).toBeTruthy();
    });

    const high = screen.getByTestId("priority-badge-high");
    const medium = screen.getByTestId("priority-badge-medium");
    const low = screen.getByTestId("priority-badge-low");

    expect(high).toBeTruthy();
    expect(medium).toBeTruthy();
    expect(low).toBeTruthy();

    // Check DOM order is high, medium, low
    const allBadges = document.querySelectorAll('[data-testid^="priority-badge-"]');
    expect(allBadges).toHaveLength(3);
    expect(allBadges[0].getAttribute("data-testid")).toBe("priority-badge-high");
    expect(allBadges[1].getAttribute("data-testid")).toBe("priority-badge-medium");
    expect(allBadges[2].getAttribute("data-testid")).toBe("priority-badge-low");

    // Also verify text content order
    expect((allBadges[0] as HTMLElement).textContent).toBe("High");
    expect((allBadges[1] as HTMLElement).textContent).toBe("Medium");
    expect((allBadges[2] as HTMLElement).textContent).toBe("Low");

    // improvements count badge
    expect(screen.getByLabelText(`${FIXTURE.improvements.length} suggestions`)).toBeTruthy();
  });

  it("shows improvements text sorted by priority", async () => {
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Improvements/i.test(t.textContent ?? ""))!);
    await waitFor(() => {
      expect(screen.getByText(IMPROVEMENTS_UNSORTED[2].text)).toBeTruthy();
    });
    // All texts should be present
    for (const imp of IMPROVEMENTS_UNSORTED) {
      expect(screen.getByText(imp.text)).toBeTruthy();
    }
  });
});

describe("AnalysisTabs – loading skeletons", () => {
  it("shows summary-skeleton when isLoading", () => {
    render(<AnalysisTabs isLoading data={FIXTURE} />);
    expect(screen.getByTestId("summary-skeleton")).toBeTruthy();
  });

  it("shows job-titles-skeleton when isLoading and on job-titles tab", async () => {
    render(<AnalysisTabs isLoading data={null} />);
    // Initially summary skeleton visible
    expect(screen.getByTestId("summary-skeleton")).toBeTruthy();
    // Switch to job titles tab
    const tabs = screen.getAllByRole("tab");
    const jobTab = tabs.find((t) => /Job Titles/i.test(t.textContent ?? ""))!;
    fireEvent.click(jobTab);
    await waitFor(() => {
      expect(screen.getByTestId("job-titles-skeleton")).toBeTruthy();
    });
  });

  it("shows improvements-skeleton when isLoading", async () => {
    render(<AnalysisTabs isLoading data={null} defaultValue="improvements" />);
    expect(screen.getByTestId("improvements-skeleton")).toBeTruthy();
  });

  it("shows all skeletons are reachable via tab switching when loading", async () => {
    render(<AnalysisTabs isLoading />);
    expect(screen.getByTestId("summary-skeleton")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]);
    await waitFor(() => expect(screen.getByTestId("job-titles-skeleton")).toBeTruthy());
    fireEvent.click(tabs[2]);
    await waitFor(() => expect(screen.getByTestId("improvements-skeleton")).toBeTruthy());
  });
});

describe("AnalysisTabs – empty states when data is null", () => {
  it('shows "No summary available" when data is null', () => {
    render(<AnalysisTabs data={null} />);
    expect(screen.getByText("No summary available")).toBeTruthy();
  });

  it('shows "No job titles suggested" when data is null', async () => {
    render(<AnalysisTabs data={null} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Job Titles/i.test(t.textContent ?? ""))!);
    await waitFor(() => {
      expect(screen.getByText("No job titles suggested")).toBeTruthy();
    });
  });

  it('shows "No improvements suggested" when data is null', async () => {
    render(<AnalysisTabs data={null} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Improvements/i.test(t.textContent ?? ""))!);
    await waitFor(() => {
      expect(screen.getByText("No improvements suggested")).toBeTruthy();
    });
  });

  it('shows empty states when data is undefined', async () => {
    render(<AnalysisTabs data={undefined} />);
    expect(screen.getByText("No summary available")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]);
    await waitFor(() => expect(screen.getByText("No job titles suggested")).toBeTruthy());
    fireEvent.click(tabs[2]);
    await waitFor(() => expect(screen.getByText("No improvements suggested")).toBeTruthy());
  });
});

describe("AnalysisTabs – error banner", () => {
  it('shows "Analysis incomplete" banner when error set', () => {
    render(<AnalysisTabs data={null} error="Something went wrong" />);
    expect(screen.getByText("Analysis incomplete")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("does not show error banner when isLoading is true even if error is set", () => {
    render(<AnalysisTabs isLoading error="Something went wrong" />);
    expect(screen.queryByText("Analysis incomplete")).toBeNull();
  });

  it("shows per-tab error fallback when error and no data", async () => {
    render(<AnalysisTabs data={null} error="API error" />);
    expect(screen.getByText("Summary unavailable")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]);
    await waitFor(() => expect(screen.getByText("Job titles unavailable")).toBeTruthy());
    fireEvent.click(tabs[2]);
    await waitFor(() => expect(screen.getByText("Improvements unavailable")).toBeTruthy());
  });
});

describe("AnalysisTabs – copy buttons and clipboard", () => {
  it("copy summary triggers clipboard.writeText and toast.success", async () => {
    const writeText = mockClipboardSuccess();
    render(<AnalysisTabs data={FIXTURE} />);
    const copyBtn = screen.getByLabelText("Copy summary to clipboard");
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SUMMARY));
    await waitFor(() => expect(mockedToast.success).toHaveBeenCalledWith("Copied!"));
  });

  it("copy job titles triggers clipboard.writeText with joined titles and toast.success", async () => {
    const writeText = mockClipboardSuccess();
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Job Titles/i.test(t.textContent ?? ""))!);
    await waitFor(() => expect(screen.getByLabelText("Copy all job titles to clipboard")).toBeTruthy());
    const copyBtn = screen.getByLabelText("Copy all job titles to clipboard");
    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JOB_TITLES.join(", ")));
    await waitFor(() => expect(mockedToast.success).toHaveBeenCalledWith("Copied!"));
  });

  it("copy improvements triggers clipboard.writeText with formatted improvements and toast.success", async () => {
    const writeText = mockClipboardSuccess();
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Improvements/i.test(t.textContent ?? ""))!);
    await waitFor(() => expect(screen.getByLabelText("Copy all improvements to clipboard")).toBeTruthy());
    const copyBtn = screen.getByLabelText("Copy all improvements to clipboard");
    fireEvent.click(copyBtn);
    const expected = [
      `• [High] ${IMPROVEMENTS_UNSORTED[2].text}`,
      `• [Medium] ${IMPROVEMENTS_UNSORTED[0].text}`,
      `• [Low] ${IMPROVEMENTS_UNSORTED[1].text}`,
    ].join("\n");
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    await waitFor(() => expect(mockedToast.success).toHaveBeenCalledWith("Copied!"));
  });

  it("clipboard rejection shows toast.error for summary", async () => {
    mockClipboardReject();

    render(<AnalysisTabs data={FIXTURE} />);
    const copyBtn = screen.getByLabelText("Copy summary to clipboard");
    fireEvent.click(copyBtn);
    await waitFor(() =>
      expect(mockedToast.error).toHaveBeenCalledWith("Copy failed. Select the text manually."),
    );
  });

  it("clipboard rejection shows toast.error for job titles", async () => {
    mockClipboardReject();
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Job Titles/i.test(t.textContent ?? ""))!);
    await waitFor(() => expect(screen.getByLabelText("Copy all job titles to clipboard")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Copy all job titles to clipboard"));
    await waitFor(() =>
      expect(mockedToast.error).toHaveBeenCalledWith("Copy failed. Select the text manually."),
    );
  });

  it("clipboard rejection shows toast.error for improvements", async () => {
    mockClipboardReject();
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs.find((t) => /Improvements/i.test(t.textContent ?? ""))!);
    await waitFor(() => expect(screen.getByLabelText("Copy all improvements to clipboard")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Copy all improvements to clipboard"));
    await waitFor(() =>
      expect(mockedToast.error).toHaveBeenCalledWith("Copy failed. Select the text manually."),
    );
  });

  it("removing clipboard mock also triggers fallback failure -> toast.error", async () => {
    // Remove clipboard to test fallback path
    Object.assign(navigator, { clipboard: undefined });
    // fallback uses execCommand which doesn't exist in jsdom, so it will return false
    render(<AnalysisTabs data={FIXTURE} />);
    const copyBtn = screen.getByLabelText("Copy summary to clipboard");
    fireEvent.click(copyBtn);
    await waitFor(() =>
      expect(mockedToast.error).toHaveBeenCalledWith("Copy failed. Select the text manually."),
    );
  });
});

describe("AnalysisTabs – tab switching", () => {
  it("clicking Job Titles trigger makes titles panel visible", async () => {
    render(<AnalysisTabs data={FIXTURE} />);
    // Initially summary visible, job titles not visible in active panel
    expect(screen.getByText(SUMMARY)).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    const jobTab = tabs.find((t) => /Job Titles/i.test(t.textContent ?? ""))!;
    fireEvent.click(jobTab);
    await waitFor(() => {
      expect(screen.getByLabelText("Suggested job titles")).toBeTruthy();
    });
    expect(screen.getByText(JOB_TITLES[1])).toBeTruthy();
  });

  it("clicking Improvements trigger makes improvements panel visible", async () => {
    render(<AnalysisTabs data={FIXTURE} />);
    const tabs = screen.getAllByRole("tab");
    const impTab = tabs.find((t) => /Improvements/i.test(t.textContent ?? ""))!;
    fireEvent.click(impTab);
    await waitFor(() => {
      expect(screen.getByLabelText("Suggested improvements by priority")).toBeTruthy();
    });
    expect(screen.getByTestId("priority-badge-high")).toBeTruthy();
  });

  it("supports controlled value prop", () => {
    render(<AnalysisTabs data={FIXTURE} value="job-titles" />);
    expect(screen.getByLabelText("Suggested job titles")).toBeTruthy();
  });

  it("calls onValueChange when tab changes", async () => {
    const onValueChange = vi.fn();
    render(<AnalysisTabs data={FIXTURE} onValueChange={onValueChange} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]);
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
  });
});

describe("sortImprovements", () => {
  it("sorts high -> medium -> low", () => {
    const sorted = sortImprovements(IMPROVEMENTS_UNSORTED);
    expect(sorted.map((i) => i.priority)).toEqual(["high", "medium", "low"]);
  });

  it("does not mutate original array", () => {
    const original = [...IMPROVEMENTS_UNSORTED];
    const copy = [...IMPROVEMENTS_UNSORTED];
    sortImprovements(IMPROVEMENTS_UNSORTED);
    expect(IMPROVEMENTS_UNSORTED).toEqual(copy);
    expect(IMPROVEMENTS_UNSORTED).toEqual(original);
  });

  it("handles empty array", () => {
    expect(sortImprovements([])).toEqual([]);
  });

  it("handles single priority", () => {
    const single = [
      { priority: "low" as const, text: "Low priority suggestion text here." },
      { priority: "low" as const, text: "Another low priority suggestion here." },
    ];
    expect(sortImprovements(single).map((i) => i.priority)).toEqual(["low", "low"]);
  });

  it("preserves stable order within same priority", () => {
    const items = [
      { priority: "high" as const, text: "High B text with enough length here." },
      { priority: "high" as const, text: "High A text with enough length here." },
      { priority: "medium" as const, text: "Medium text with enough length here." },
    ];
    const sorted = sortImprovements(items);
    expect(sorted[0].text).toBe("High B text with enough length here.");
    expect(sorted[1].text).toBe("High A text with enough length here.");
  });
});

describe("formatImprovements", () => {
  it("formats sorted improvements with bullet and priority label", () => {
    const formatted = formatImprovements(IMPROVEMENTS_UNSORTED);
    const expected = [
      `• [High] ${IMPROVEMENTS_UNSORTED[2].text}`,
      `• [Medium] ${IMPROVEMENTS_UNSORTED[0].text}`,
      `• [Low] ${IMPROVEMENTS_UNSORTED[1].text}`,
    ].join("\n");
    expect(formatted).toBe(expected);
  });

  it("returns empty string for empty array", () => {
    expect(formatImprovements([])).toBe("");
  });

  it("formats single improvement", () => {
    const single = [{ priority: "high" as const, text: "Improve summary with metrics." }];
    expect(formatImprovements(single)).toBe("• [High] Improve summary with metrics.");
  });

  it("sorts before formatting even if given unsorted", () => {
    const unsorted = [
      { priority: "low" as const, text: "Low text here with enough chars." },
      { priority: "high" as const, text: "High text here with enough chars." },
    ];
    const result = formatImprovements(unsorted);
    expect(result.startsWith("• [High]")).toBe(true);
    expect(result).toContain("• [Low]");
    const lines = result.split("\n");
    expect(lines[0]).toContain("[High]");
    expect(lines[1]).toContain("[Low]");
  });
});
