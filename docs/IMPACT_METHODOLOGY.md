# How Swacchify calculates impact

## What is measured (facts)

- **Waste diverted (kg):** the verified weight of each pickup item, weighed at the Swacchify hub. It is not the
  household's estimate, and not the partner's doorstep reading.
- **Recycled vs donated:** determined by the pickup's purpose.
- **Pickups:** the number of completed, verified pickups.
- **Where it went:** the recycler, their processing method and the order status, from `lot_allocations`.

Each verified item writes exactly one `impact_records` row. Every dashboard (household, personal, admin, landing
page) reads from that table, so the numbers always agree.

## What is estimated (clearly labelled)

**CO₂e avoided** = verified kg × a per-category factor (`waste_categories.co2e_factor`, kg CO₂e per kg):

| Category | Factor |
|---|---|
| Plastic | 1.5 |
| Paper & Cardboard | 0.9 |
| Metal | 2.5 |
| Glass | 0.3 |
| Textile | 2.0 |
| E-Waste | 1.5 |
| Other | 0 (not collected) |

These are **indicative placeholders**: rough midpoints of the ranges commonly reported in recycling
life-cycle studies for recycling instead of landfilling. Real savings depend on the exact material (aluminium is
far higher than steel, for example), the recycling process, transport distances and the local grid. Before
publishing any claims, review the factors with a sustainability specialist and document the sources. Admins can
change the factors in the database; past records keep the value calculated when they were created.

The UI always shows CO₂e with "~" and the word "estimate", and links to this explanation.
