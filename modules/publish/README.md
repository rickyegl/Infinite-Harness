# publish

A **dry-run** publishing plan for the run's reels: which TikTok, Instagram and YouTube account would post each
one, and when. It never uploads, schedules or signs in; real publishing needs the author's approval and is done
by the author with the studio's own tools.

- **Reels:** every `reel.json` a reel cell wrote in the run (`{ generator, project, file, title }`), or
  `params.reels` in the same shape.
- **How:** `plan.py` runs in the studio's `shared/tools` folder and calls the TikTok and Instagram planners'
  own `plan()` (their "no browser" command). The reels join the catalog in memory only, as unpublished rows.
  YouTube's planner needs its API, so its slot is the channel's next daily time on a day the catalog has free.
- **Dry run, enforced:** inside `plan.py` every socket connect and name lookup raises, and the schedulers'
  writers (catalog, post lists) are replaced by functions that raise. It prints JSON whose `mode` is
  `DRY RUN`; the module refuses any other answer. No bytecode is written into the studio.
- **Evidence:** the plan as a page (one line per post). **Files:** `plan.png`, `plan.json`.
- **Test:** `apps/bridge/test/reels.test.ts` runs `plan.py` against the real studio and checks the marker and
  that `catalog.csv`, `tiktok_posts.csv` and `instagram_posts.csv` are unchanged.

Trailers have no account in the studio's schedulers, so a trailer shows as "no account".
