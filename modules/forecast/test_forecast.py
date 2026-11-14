"""Input checks that must pass before model loading or inference."""
import datetime as dt
import tempfile
import unittest
from pathlib import Path

from forecast import _read_series, _step_dates


class SeriesInputTests(unittest.TestCase):
    def test_month_rollover(self):
        dates = [f"2025-{month:02d}-01" for month in range(1, 13)]
        self.assertEqual(_step_dates(dates, 2), ["2026-01-01", "2026-02-01"])

    def test_daily_leap_day(self):
        self.assertEqual(_step_dates(["2024-02-27", "2024-02-28"], 2), ["2024-02-29", "2024-03-01"])

    def test_missing_month_is_rejected(self):
        with self.assertRaises(ValueError):
            _step_dates(["2025-01-01", "2025-02-01", "2025-04-01"], 2)

    def test_invalid_csv_is_rejected(self):
        dates = [(dt.date(2025, 1, 1) + dt.timedelta(days=i)).isoformat() for i in range(16)]
        rows = [f"{date},{i}" for i, date in enumerate(dates)]
        corruptions = ["2025-01-16,NaN", "2025-01-16,inf", "2025-01-16,", "bad-date,1", "2025-01-15,1", "2025-01-16"]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.csv"
            for bad in corruptions:
                with self.subTest(row=bad):
                    path.write_text("date,demand\n" + "\n".join(rows[:-1] + [bad]) + "\n", encoding="utf-8")
                    with self.assertRaises(ValueError):
                        _read_series(path)


if __name__ == "__main__":
    unittest.main()
