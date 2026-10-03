# Indigo Loom — the demo script

A walk through the whole system for an audience, from an empty company to a delivered order, using only the screens an owner uses. Nothing is pre-loaded: every supplier, price, order and customer comes in through the app's own **Import** and **Upload document** buttons from the files in this pack, or is typed where an owner would type it.

The story is **Indigo Loom Apparel Pvt Ltd**, a made-up jeans factory in Narol, Ahmedabad, making about 600 pairs a day. Every company, GSTIN, phone number and price is invented.

- **Full run: about 25 minutes**, twelve acts.
- **Short run: about 12 minutes** — do only the steps marked ★ and skip the acts marked *(optional)*.

Labels in **bold** are the words on the button, tab or menu. Text in `code` is what to type. The quoted lines are what to say while you do it. Every step below has been played through the app exactly as written.

## Before you start

1. Make the pack fresh on the morning of the demo, so the three open purchase orders fall on the right days (one lorry lands today, one landed two days ago, one is due in four days): `node demo/make-demo-pack.mjs`. The pack lands in `demo/pack/`, zipped as `demo/indigo-loom-demo-pack.zip`.
2. Unzip it where you can reach it from the file picker. Keep the `quotes` folder open — you will upload from it several times.
3. Open the app in a browser at 1440 px wide or more, with nothing else on the screen. Use a fresh workspace: on a laptop running `npm run dev`, the first screen is the workspace form; on the hosted site, sign up with an email and password and the same form follows.
4. The upload reader works on the device: a PDF reads in a second, a photograph goes through OCR and takes ten to thirty seconds the first time. Upload Q5 once before the audience arrives so the OCR files are cached, then start a new workspace.
5. The app never sends anything. WhatsApp and Email buttons open them with the words and the document ready; nothing leaves without you pressing send there. Say this early — it is the question every owner asks.

## The story in one line

> "Indigo Loom buys denim and trims, checks them at the gate, keeps them on racks, cuts and stitches jeans on job cards, and ships them on challans — and the owner sees all of it from one place without anyone keying anything in twice."

---

## Act 1 — The company ★ (1 min)

**Screen:** the sign-in page.

1. **Your name** `Asha Patel` · **Your company** `Indigo Loom Apparel Pvt Ltd` · **What do you make?** `Denim jeans - 5-pocket, about 600 pairs a day` · pick **Owner** · **Create my workspace**.
2. On the Welcome page, find **Company details** at the bottom right and press **Change**. **Next**. Address `Plot 17, Narol-Vatva Road, Narol, Ahmedabad 382405` · GSTIN `24AAFCI4821K1Z3` · Phone `+91 98790 11045` · Email `purchase@indigoloom.example`. **Next**, then **Save**.

> "This is the letterhead. Every purchase order, challan and goods receipt note prints from it. The GSTIN tells the system we are in Gujarat, so it already knows which of our customers are inter-state — we will see that on a challan later."

Point at the Welcome page: five stages, each with a start button, and **Your rules** — five chips that all say *default*. "Nothing has to be configured before you start. Rules can be set later; sensible defaults apply until then."

## Act 2 — Suppliers and materials from Excel ★ (2 min)

**Screen:** **Sourcing › Suppliers** (the Sourcing tile on the Welcome page).

1. **Import** → choose `01-suppliers.xlsx` → **Next** through the steps (every column matches by itself) → **Import 12 rows** → **Close**.
2. **Materials** in the left rail → **Import** → `02-materials.xlsx` → **Next** … → **Import 15 rows** → **Close**.

> "These are the two spreadsheets every factory already has. The column names are read, not mapped by hand — 'Last paid', 'On hand', 'Used per day', 'Days of cushion', 'Smallest order'. The 'On hand' column becomes the opening stock, so the store is counted the moment the sheet lands."

Point at the Materials list: 15 materials, each with used per day and stock. "Twelve suppliers — nine we buy from and three jobworkers: a laundry, an embroiderer and a screen printer. Fabric in metres, everything else in pieces."

## Act 3 — Quotations as documents ★ (3–5 min)

**Screen:** **Sourcing › Suppliers**.

1. ★ **Upload document** → `quotes/Q1-Sabarmati-Denim-Mills.pdf`. Wait a second: the supplier is recognised, the date, validity, payment terms and **2 priced lines** are read off it. **Next** — each line is matched to one of our materials by its code. **Next** — "Days to deliver: 21", read off the document. **Approve 2 lines** → **Close**.
2. ★ **Upload document** → `quotes/Q5-Amba-Thread.jpg`. This one is a photograph: watch it go through OCR, then the same card appears — Amba Thread Company, 2 priced lines, 5 days. **Next**, **Next**, **Approve 2 lines**, **Close**.
3. *(full run)* Do the same for Q2, Q3 (4 lines), Q4 (3 lines), Q6 (a PNG scan) and Q7 (a GIF).
4. ★ **Quotes** in the rail → **Import** → `03-quotes-from-sheet.xlsx` → **Import 5 rows** → **Close**. "Two more suppliers sent prices as a spreadsheet instead."
5. ★ On **Quotes**, press **Accept all** on each quotation until none is left. "A quotation is what they said. Accepting it makes it a price we will buy at."
6. ★ **More › Landed cost** in the rail. Pick `Denim 12 oz rigid indigo 147 cm` in the dropdown.

> "The two mills side by side: Sabarmati at ₹242 is the cheapest quoted and, for now, the cheapest landed. Notice the yellow band — it says plainly what is still missing from the comparison: freight, GST you cannot claim back, what your money costs, a rejection rate. Those go on each supplier under 'Landed-cost detail'. Until they are there it is a list of quotes, and it says so rather than inventing a comparison."

## Act 4 — Rules *(optional, 1 min)*

**Screen:** the Welcome page (**All stages** at the top of the rail takes you back).

1. Under **Your rules**, press **Buying**. Read a question or two aloud — "How much stock should one order bring in?" — then **Next** five times and **Save my rules**. The chip now says *set*.

> "The rules are written as decisions, not settings. Every one has a default already working; setting them only changes what the desk recommends."

## Act 5 — Open purchase orders ★ (2 min)

**Screen:** **Sourcing › Purchase orders**.

1. **Import** → `04-open-orders.xlsx` → **Next** … → **Import 3 rows** → **Close**.

Three orders appear, each as a journey: **Handed over → They confirmed → At the gate → Checked → On the shelf**, grouped by when they are due.

> "The Amba thread sits under **Late** — 2 days past the promise, with the dashed line to the gate drawn red. The other two are **Due this week**: the Metro lorry with the Jacron patches is promised today, and the Sabarmati denim is due in four days. Every row carries the one thing to do next — here, **Record what arrived** — and nothing else."

2. **Dashboard** in the rail.

> "The Sourcing dashboard reads all of this and says what to buy today. Hang tags are short with nothing on order, so it asks for an order. Stretch denim and topstitch thread are short on the shelf but covered by the orders we just imported, so it says nothing about them. The late Amba order is on the list to chase."

## Act 6 — A change to an order, confirmed on WhatsApp *(optional, 2 min)*

**Screen:** **Sourcing › Purchase orders**, the Sabarmati row (PO-1).

1. Click the row to open it. In the pink block under the line, press **Change**. Quantity `3500`, reason `Export order grew` → **Save v2**. The row now says *changed, supplier not told*.
2. **Send the change** — the revised PO opens as a document, with the change written on it ("3,000 m → 3,500 m, why: Export order grew"). Press **Download** (or **WhatsApp**) — that is what hands it over — then **Close**.
3. **They confirmed** → reference `WhatsApp from Sabarmati, 11:26` → choose the picture `confirmations/Sabarmati-WhatsApp-confirmation.png` → **Record their confirmation**.

> "Every change is a numbered version with a reason, sent as a document. Their reply is kept against it — a screenshot is enough. The strip now reads confirmed at 3,500 metres, and the gate will expect 3,500, not 3,000."

## Act 7 — The gate ★ (3 min)

**Screen:** **Inbound › Checks** (the Inbound tile on the Welcome page, then **Checks** in the rail).

1. **Import** → `05-checks.xlsx` → **Next** … → **Import 31 rows** → **Close**. "Two to four checks for every material: a reading with a band, a look, a count, or a certificate that must be present — and where a failure lands: hold, reject, or usable with a note."
2. **Receiving** in the rail → **Goods arrived**. Pick `PO-2 · Jacron patch 7 x 5 cm · Metro Trims and Accessories` — the form says "2 checks on Jacron patch". Quantity `15000` → the **…at the gate** button.
3. The inspection opens, check by check. **Size**: reading `70` — inside 69–71, it marks itself **Pass**. **Print legible**: press **Fail** — the form says where a failure lands: *cannot be used — "Logo print smudged"*. **How much are you turning back?** `200` — it answers "accepting 14,800 nos · this delivery: 1.3%". **Close the receipt**.
4. The goods receipt note GR-001 opens. **Download** it, or press **WhatsApp** to show the words that would go to the supplier. **Close**.

> "Nothing is stock until it is inspected. 14,800 patches went on the shelf; 200 are rejected with the check that failed written against them. The GRN is the paper the supplier gets — and the dashboard now measures 'inspected in time' and 'rejected on arrival' from this receipt, not from anything typed."

5. **Dashboard** in the rail: inspected in time, rejected on arrival, and anything still standing at the gate.

## Act 8 — The store *(optional, 2 min)*

**Screen:** **Inventory › Dashboard**. Open **Setting up inventory** at the foot of the rail.

1. **Name your racks** → Rack 1 `A-1` with `Fabric rolls` · Rack 2 `A-2` with `Trims and labels` · Rack 3 `B-1` with `Packing` → **Add these 3 racks**.
2. **Stock in hand** is already ticked — the opening stock came in with the materials sheet ("15 of 15 materials counted"). Press its **Change** to show the count per material and the days of cover worked out as you type, then **Save the count**.
3. **Stock ledger** in the rail: the **Lots** tab shows every lot, including the one the gate just wrote (GR-001); **Movements** shows the receipt and the issue slips to come.

> "The store is a ledger, not a number. Every quantity on the shelf is a lot with a date, a rack and where it came from. A count is a movement too — and 'Walk a rack' prints a count sheet for one rack and takes the figures back."

## Act 9 — Products and the floor ★ (4 min)

**Screen:** **Production › Dashboard**, the **Setting up production** panel at the foot of the rail.

1. ★ **Add your products** → Product 1 `Rigid slim jeans 12 oz` (unit *pieces*) → **Next** → **Add a material** for each line: `Denim 12 oz rigid indigo 147 cm` `1.4` · `Pocketing fabric 110 cm white` `0.35` · `Metal zip 18 cm brass teeth` `1` · `Shank button 17 mm antique brass` `1` · `Copper rivet 9 mm` `6` → **Add this product**.
2. ★ **Set up job numbers** → **A style** → **Next** → what it is `Rigid slim jeans 12 oz` → **Save, and open ST-1**.
3. ★ The dashboard now says *ST-1 is open with no plan* under **Waiting on you**. Press **Plan ST-1** → quantity `1200`, start two days ago, finish five days from now → **Plan it**. "172 a day, and 344 should already have come off — the line is behind before it starts, and the card says so."
4. ★ **Job cards** in the rail. ST-1 is the one row, under **Behind the plan**, with its strip: **Opened → Material issued → Made → Closed**. Click it to open. The **Material** table says what the plan needs from the shelf: 1,680 m of denim, 420 m of pocketing, 1,200 zips …
5. ★ **Issue material** → `1700` m of the denim → **Issue it**. "Slip IS-1 is written, the shelf drops by 1,700 metres, and the row shows 1,700 gone to it against 1,680 needed."
6. *(full run)* **Send for jobwork** → jobworker `Rangoli Screen Printers`, material `Jacron patch 7 x 5 cm`, quantity `3000`, process `Logo printing`, should come back `98` %, due in six days → **Send it out**. "Material at a jobworker is still ours: challan JW-1 is on the card and in the store's ledger, and the gate will expect 2,940 back by the date."
7. ★ **Book output** (top right) → style ST-1, good `400`, rejected `8`, reason `Stitching` → **Book it**.

> "The job card is the one record the floor works from: the plan, what was issued, what is at the jobworker, what came off the line — on one strip. 400 pairs are now finished goods on the shelf, and the plan reads 400 of 1,200 with five days to go."

8. *(full run)* **Line watch** in the rail → the **Halts** tab → **Record a halt** → **Machine down**, note `Overlock 3 needle broke` → **Record it**. Back on **Dashboard**, the halt is the first card under Waiting on you: **It has resumed**.

## Act 10 — Customers, carriers and a sales order ★ (3 min)

**Screen:** **Dispatch › Dashboard**, the **Setting up dispatch** panel.

1. ★ **Add your customers** → **Bring them in from Excel** → `06-customers.xlsx` → **Next** … → **Import 5 rows** → **Close**. "Two in Gujarat, three outside it. The state is read off each GSTIN — nobody types it."
2. ★ **Add your carriers** → **Bring them in from Excel** → `07-carriers.xlsx` → **Import 4 rows** → **Close**. "Our own tempo, a part-load transporter, a full-truck carrier and a courier, each with a rate per kg per km where they gave one."
3. ★ **Set the dispatch rules** — our state is already read off the GSTIN (Gujarat); the e-way bill threshold ₹50,000, on time 95 %, a seven-day promise → **Next**, **Save the dispatch rules**.
4. ★ **Sales orders** in the rail → **New sales order** → customer `Deccan Denim Retail` · product `Rigid slim jeans 12 oz` · quantity `300` · rate `1150` · made on `ST-1 — Rigid slim jeans 12 oz` → promise date as offered (seven days, from the rule) → **Save the sales order**. "Order value ₹3,45,000, and the line is tied to the job card making it."
5. *(full run)* **New sales order** again → `Rajkot Garment House` · `150` at `1150` → **Save the sales order**.

Each order reads as a journey — **Taken → Job card → Made → Dispatched → Delivered** — and SO-1 already shows 300 of 300 made, with the ST-1 chip linking back to the card. SO-2 says *from stock · already on the shelf*.

## Act 11 — The delivery challan and the road ★ (3 min)

**Screen:** **Dispatch › Sales orders**, SO-1.

1. ★ Press **Dispatch** on the SO-1 row. "Dispatch against SO-1": quantity `300` is already there — the lesser of what is still to go and what is on the shelf — at the order's rates ₹3,45,000. Weight `240` kg. Tick **Book it with a carrier now** → carrier `Saurashtra Roadways · part load` · docket `SR/AHD/48213` · customer told to expect it in two days · leave Freight blank (it is worked out from the rate) → **Raise the challan**.
2. ★ DC-1 opens as the document. Read the line under the title: *Taxable value ₹3,45,000 · Place of supply Maharashtra · Across states (IGST) · E-way bill needed — the value is at or over ₹50,000*. **Download** or **WhatsApp**, then **Close**.

> "The challan is derived, not typed: the values from the order, the GST type from the two GSTINs, the e-way bill from the rule, the freight from the carrier's rate and the customer's distance. If this had gone to Rajkot it would say CGST and SGST."

3. ★ **Consignments** in the rail: DC-1 is *In transit* with Saurashtra Roadways, promised in two days, freight ₹1,526 — ₹5.09 a pair. Press the tick (**Delivered**) on the row → *Who confirmed it, and how* `R. Iyer at their stores, on the phone` — the form says "2 days early" → **Mark delivered**.
4. ★ **Dashboard**: **On time, in full 100 %** — 1 of 1 delivery, target 95 % — with order to dock, finished stock, freight per unit and dispatched this month beside it; the road picture shows DC-1 delivered.

> "A delivery date needs a name. Once it has one, the promise is kept or broken on the record, and 'on time, in full' is a measured figure, not a feeling."

Back on **Sales orders**, SO-1 has gone from the list: delivered orders fold under the line at the foot — *1 delivered · show them*.

## Act 12 — The whole business at a glance ★ (2 min)

**Screen:** the Welcome page (**All stages**).

> "This is what the owner opens every morning."

1. ★ The band: *N need you · 1 of 1 goals on track · today's date*. The top row: **Order book** (what is still to ship, at selling value), **Dispatched this month** (the ₹3.45 L that just left), **On order** from suppliers, **Stock on the shelf**, **At jobworkers** — all at selling value or the last price paid, nothing invented.
2. ★ The pictures: dispatched by month, sales orders by promise, where your money is, spend by material, the job cards, days of stock.
3. ★ **Work queues** — one list across every desk: materials running short, the late purchase order, prices agreed but not ordered, goods due at the gate. Each line opens the desk that fixes it.
4. ★ **Goals — your own rules**, judged: on time in full ≥ 95 %, scrap ≤ 3 %, counts matching the book, jobworkers under the ceiling, checked in time, job cards on plan. **Recent activity** underneath.
5. ★ The five stage cards, each with its own figures and its open work.
6. *(optional)* Narrow the browser to phone width, or open the same address on a phone: every list folds to a row and five dots, and nothing scrolls sideways.

> "Nothing on this page was keyed in for the page. It is the same records you watched go in: a spreadsheet, a quotation, a lorry at the gate, a job card and a challan."

---

## If something goes wrong

- **A photographed quotation reads nothing.** OCR needs its files the first time; wait for the dialog's progress, or use the PDF of the same kind (Q1–Q4) and come back to the photo later.
- **An import says a row was left out.** The dialog names the row and why — it never guesses. Import the rest; the one row can be typed after.
- **The gate says nothing is on its way.** The orders sheet was not imported, or the Metro order was already received. **Sourcing › Purchase orders** shows each order's strip.
- **Dispatch refuses the quantity.** The challan will not send more than the order wants or more than came off the floor — book the output on the job card first (Act 9, step 7).
- **A button is not where the script says.** Every list has the same shape: the one thing to do is the filled button on the row; everything else is inside the row once it is opened.
- **You want to start over.** Create a new workspace from the sign-in page; the old one is left alone.

## What is in the pack

| File | What it is | Where it goes |
| --- | --- | --- |
| `00-DEMO-script.pdf` | This script | — |
| `01-suppliers.xlsx` | 12 suppliers, 3 of them jobworkers | Sourcing › Suppliers › Import |
| `02-materials.xlsx` | 15 materials with opening stock, daily use, cushion, smallest order | Sourcing › Materials › Import |
| `quotes/Q1–Q4 .pdf` | Quotations from the denim mills, trims and labels | Sourcing › Suppliers › Upload document |
| `quotes/Q5 .jpg, Q6 .png, Q7 .gif` | Quotations as a photo, a scan and a GIF | Sourcing › Suppliers › Upload document |
| `03-quotes-from-sheet.xlsx` | Two suppliers who sent prices as a sheet | Sourcing › Quotes › Import |
| `04-open-orders.xlsx` | 3 purchase orders with suppliers: one late, one at the gate today, one coming | Sourcing › Purchase orders › Import |
| `05-checks.xlsx` | 31 checks at the gate, 2–4 per material | Inbound › Checks › Import |
| `06-customers.xlsx` | 5 customers, Gujarat and outside | Dispatch › Add your customers › Bring them in from Excel |
| `07-carriers.xlsx` | 4 carriers with how they carry and a rate | Dispatch › Add your carriers › Bring them in from Excel |
| `confirmations/…png` | The denim mill confirming a changed order on WhatsApp | Purchase orders › They confirmed |

Products, racks, job cards, sales orders and challans are typed on the screens — there is no sheet for them because an owner makes them one at a time.
