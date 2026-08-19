# RP-TRN-L3-001 — Level 3 Training Guide (Advanced Troubleshooting, Plug Selection & Product Intelligence)

Document: RP-TRN-L3-001 | Version: 2.0 | Applies to: All Current RP FSMs & Technical Bulletins
Prerequisites: Level 1 and Level 2. Confidential and proprietary to Repeat Precision, LLC.

## 2. Advanced Plug Selection Logic

### 2.1 Selection factors
Casing OD/weight (plug OD clearance + RIH speed limits); Bottom Hole Temperature (composite degrades hot; bridge plugs more sensitive than frac plugs); Pressure (within rating, above and below); Basin/Geography (Haynesville and international require Engineering approval; Eagle Ford restricts bridge plugs); Application type (frac vs bridge vs cap); Time downhole (longer-exposed bridge plugs risk loss of isolation); Frac water chemistry (affects PurpleReign dissolution — vet with product team).

### 2.2 5.5" casing: 425 PSC vs 438 PSC matrix (ENG-TB-00031)
| Plug Model | Casing Weight (ppf) | Status |
|---|---|---|
| 425 PSC | 20.0 | Standard — use without restriction |
| 425 PSC | 23.0 | Approved |
| 438 PSC | 17.0 | Approved |
| 438 PSC | 20.0 | Product Team approval required |
| 438 PSC | 23.0 | NOT APPROVED — rating removed |

Why 425 is preferred over 438 in 20# casing: the 425 has **larger clearance to the casing** (more reliable in tight geometries such as curves); updated upper slip design for enhanced anchoring; fused slip segments improve vertical-section reliability; improved lower cone geometry; verifiable run history supports the 425 as more reliable than the 438 in this application.

### 2.3 Basin-specific approval requirements (ENG-TB-00029)
| Basin / Region | Frac Plugs | Bridge Plugs |
|---|---|---|
| Most North America basins | No approval needed | No approval needed |
| Eagle Ford | No approval needed | Product Team approval required |
| Haynesville | **Product Team approval required** | **DO NOT OFFER** |
| International | Product Team approval required | Product Team approval required |
| Canadian region | No approval needed | No approval needed |

When requesting approval, provide: Customer Name, Plug Type, Plug Size, Casing Size, Basin, BHT, Setting Tool (if available). Send to Matt Merron and Evan Blott (alternates: Collin Shaw and Grant Martin).

### 2.4 5.5" bridge plug selection (ENG-TB-00028)
| Casing Weight | Cap Plug Application | Lateral Application (Toe Prep, Stage Isolation) | ConocoPhillips Cap Plugs |
|---|---|---|---|
| 5.5" 17 ppf | 22502 (438 Cast Iron Upper Slip) | 36656.X04 (438 w/ ceramic buttons) | 36656.X04 (438 w/ ceramic buttons) |
| 5.5" 20 ppf | 22502 (438 Cast Iron Upper Slip) | 36656.X04 (438 w/ ceramic buttons) | 36656.X04 (438 w/ ceramic buttons) |
| 5.5" 23 ppf | 22502 (438 Cast Iron Upper Slip) | 44508 (425 w/ ceramic buttons) | 44508 (425 w/ ceramic buttons) |

Cap applications for new customers use the cast-iron upper-slip bridge plug (22502) for ALL 5.5" casing weights; all-composite plugs are for lateral applications.
- [CAUTION] If a cap plug is to be set below the 60° mark in 5.5" 23 ppf casing, contact Matt Merron or Evan Blott before proceeding.
- [WARNING] DO NOT deliver PM (powdered-metal) button bridge plugs to ConocoPhillips — they require ceramic-button all-composite bridge plugs.

## 3. Field Troubleshooting — Failure Mode Analysis

### 3.1 Pre-set (plug sets prematurely before target depth)
| Symptom | Likely Root Cause | Corrective Action |
|---|---|---|
| Sets in the curve or curve exit | Pump rate/line speed outside the safe operating window (shaded areas of chart) | Consult updated pumpdown chart; stay within the operating window |
| Pre-set in vertical section | Running too fast without adequate pump rate; fluid bypass damage | Maintain minimum 2 BPM; limit line speed per chart |
| Pre-set in 20# 5.5" casing | Using 438 PSC without approval | Switch to 425 PSC per ENG-TB-00031 |
| Pre-set with PurpleReign LT elements | Pump rate too low/inconsistent through 30°–90° | Use LT-specific pumpdown chart; maintain mandatory rate continuously |
| Anti-preset screw not installed | Sleeve moves prematurely during RIH | Anti-preset screw is MANDATORY; rebuild WLAK |
| Over-torqued shear screws | Screws damaged, cause premature actuation | Use hand tools only; apply only 0.25–0.50 turn after contact |

### 3.2 Setting tool misfire
| Symptom | Likely Root Cause | Corrective Action |
|---|---|---|
| No tension drop after firing | Faulty igniter or fluid present in the power-charge chamber | Follow well owner POOH requirements; max 200 ft/min (vertical, cleaned well) |
| Partial tension drop | Inadequate power-charge burn, pressure escape, or plug set in debris | Wait 60–90 sec before retrieving; verify shear screw count |
| Setting tool stuck POOH | Setting sleeve not properly removed; sand packed around assembly | Rotate sleeve with pipe wrenches; clean threads with brush/fluid |
| Adjuster nut stuck | Gaps present in setting tool; screw landed on thread | Remove safety shear screws BEFORE depressurizing; rebuild setting tool |

Line-tension loss after firing varies widely (typically ~50–450 lb depending on deviation, setting tool, and depth); a reading outside the typical range does not by itself confirm failure — always wait 60–90 seconds and assess before POOH, and contact Repeat Precision if uncertain.

### 3.3 No-tag during drill-out
A "no-tag" means the drill bit fails to engage the plug during mill-out (plug missing, dissolved, or moved). Contributing conditions: composite weakened by water/high temperature; exceeding BHT limits; service-rig type and weight-on-bit management dislodging a plug before drilling; bridge plugs left downhole long enough to lose isolation and displace. Haynesville applications require Engineering approval specifically due to this risk.

### 3.4 FracSure Express anti-preset screw (ENG-TB-00024)
On 425/438 Express assemblies the WLAK anti-preset screw can lodge in the setting sleeve during POOH. Resolution:
- Express assemblies used with Repeat Precision (RP20) setting tools: the WLAK preset screw is removed; the RP20's own anti-preset screws prevent movement during RIH.
- When using 438 or 425 PSC frac plugs with a NON-Repeat Precision setting tool: the WLAK anti-preset shear screw IS required.
- 425 Setting Sleeve Rev X04 includes updates to prevent sheared screw nubs from falling out.

### 3.5 PurpleReign stuck in tool trap
The PurpleReign shaft tail pipe protrudes below the plug in both RIH and POOH states and can wedge between the two forks of the tool trap.
- A pre-job risk assessment and fit check are required before every PurpleReign job.
- Never set weight down on the shaft while it rests on the tool trap.
- Always verify the shaft is clear of the fork pathway BEFORE opening the tool trap.
- Even a low-risk fit check can still result in a stuck event if the flapper is opened before the shaft clears the forks.
- [WARNING] This hazard exists in BOTH RIH and POOH. Communicate and train wireline crews on it before every job.

## 4. Plug Removal

### 4.1 PurpleSeal drill-out
| Parameter | Specification |
|---|---|
| Mill/Bit OD | 95%–98% of casing drift diameter (smaller = coring; larger = debris blockage) |
| Weight on Bit | 1,000–3,000 lb [444.8–1,334.5 daN] |
| Recommended drill-out time | 5–10 minutes per plug |
| Preferred tool type | Rock bit (faster drill-out, smaller debris) |

If a spinning plug 'stump' is encountered, increase WOB until stabilized, then return to the recommended range. See RPL-FSM-10001 Section 5.1 for API casing-specific bit sizes.

### 4.2 PurpleReign dissolution
- Increase salt concentration in wellbore fluid — dissolvable plugs dissolve faster in high-salinity environments.
- Acid treatment: use hydrochloric acid (HCl) to accelerate dissolution if a pre-set is encountered — **10–15 barrels spotted at estimated plug depth can remove the plug within 3–4 hours**.
- Mechanical mill-out with coiled tubing can remove remaining material after frac.
- [CAUTION] Consult Repeat Precision Engineering BEFORE any acid spotting, including acid during pump-down.

## 5. Mirrored Slip Design Upgrade (ENG-TB-00027)
The 425 PSC and 438 PSC transitioned to a new mirrored slip design (same geometry top and bottom).
| Aspect | Legacy | Current Mirrored Slip |
|---|---|---|
| Upper slip geometry | Different from lower | Mirrored — same top and bottom |
| Buttons per top slip | 3 | 4 (6 new buttons total per plug) |
| Total button count | 48 | **54** |
| Material | Varied top vs bottom | Standardized, both slips same |
| Reliability | Inconsistent top slip | Improved consistency + peak pressure |

Benefits: lower load per button, better post-set anchoring, higher peak pressure capability. (Current RP product has 54 buttons vs ~64 in comparable competitor plugs.)

## 6. StageSaver Brass Pin Configuration Change (ENG-TB-00038)
Effective January 26, 2026, all StageSaver frac-plug assemblies are built with **3 brass shear pins** instead of 4.
| Parameter | Previous (4-pin) | Current (3-pin) |
|---|---|---|
| Brass pin count | 4 | 3 |
| Assembly shear rating | 5,000 psi | **3,750 psi** |
| Type of change | — | Functional shear-value change (not form/fit) |

- [CAUTION] Verify pin count AND shear rating before every StageSaver deployment. Do NOT modify existing 4-pin assemblies in inventory — run them as-is. Do not substitute pin quantity without Engineering approval.
- [NOTE] The 4-brass-pin configuration is NOT available without prior Engineering approval.

## 7. Field Troubleshooting Decision Framework
1. Identify the symptom (pre-set, misfire, POOH issue, no-tag, stuck BHA, incorrect pressure response).
2. Review the pumpdown chart — confirm pump rate and line speed were within the operating window at the time of the event.
3. Check assembly records — correct shear screw count, anti-preset screw installed, correct gap, correct plug model for casing.
4. Check product suitability — correct plug size, temperature rating, basin approval status.
5. Check for current Technical Bulletins addressing the symptom.
6. Document and report — all failures must be documented and reported to Repeat Precision Engineering for root-cause analysis. On a fired-but-unset plug, document/photograph the condition of the plug, adapter kit, and setting tool on retrieval; inspect the power-charge chamber for a present charge and water intrusion; and inspect the firing-head igniter to determine whether it fired — before any further action.
7. Gather all wellsite information: wireline logs of the problem run, wireline logs of the prior run on the same well, and pumpdown charts of the problem run.

- [WARNING] Never re-run a plug that has been downhole and returned to surface unset, regardless of apparent condition.
