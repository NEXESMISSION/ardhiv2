# Land Patch Data Analysis Report

## Summary
- **Total Unique Parcels**: 192 parcels
- **Numeric Parcels**: 190 (excluding special cases)
- **Special Cases**: 2 (5 (S) and 5 (L))

---

## ⚠️ CONFLICTS FOUND

### Parcel 5 Duplicate
**ISSUE**: Parcel number 5 appears twice with different surface areas:
- **5 (S)**: 400 m²
- **5 (L)**: 44,503 m² ⚠️ (This is extremely large - possible typo?)

**RECOMMENDATION**: 
- Verify if "5 (L)" should be 445.03 m² or 4,450.3 m² instead of 44,503 m²
- Or confirm if this is intentional (perhaps a large combined lot)

---

## 📊 GAPS ANALYSIS (Missing Parcel Numbers)

### Missing in Range 1-90:
- **5** (but has 5 (S) and 5 (L) variants)

### Missing in Range 91-135:
- **91, 92, 93, 94, 95, 96, 97, 98, 99, 100** (10 missing)

### Missing in Range 136-384:
**Large gaps found:**
- **136-168** (33 missing)
- **187** (1 missing)
- **206-215** (10 missing)
- **217-274** (58 missing)
- **298-373** (76 missing)
- **379-383** (5 missing)

**Total Missing Numbers**: 183 missing parcel numbers

---

## 📋 PARCEL NUMBER RANGES PRESENT

**Present ranges:**
- 1-4, 6-47 (with 5 as special cases)
- 48-90
- 101-135
- 169-186
- 188-205
- 216, 275-297
- 374-378, 384

---

## 🔍 SPECIAL OBSERVATIONS

1. **Parcel 5 (L)**: 44,503 m² seems unusually large (44.5 hectares). Please verify this value.

2. **Non-sequential numbering**: The parcel numbers jump around (e.g., 90 → 101, 135 → 169, 205 → 216, 297 → 374)

3. **Surface area variations**: 
   - Most parcels: 397-400 m²
   - Some larger: 500-700+ m²
   - One very large: 44,503 m² (Parcel 5 (L))

---

## ✅ RECOMMENDATIONS

1. **Verify Parcel 5 (L)**: Confirm if 44,503 m² is correct or if it should be a different value
2. **Decide on missing numbers**: Are parcels 91-100, 136-168, etc. intentionally skipped or missing from the data?
3. **Naming convention**: Decide how to handle "5 (S)" and "5 (L)" - use as-is or rename to avoid conflicts

---

## 📝 DATA QUALITY

- ✅ No duplicate conflicts (same number, different area) - except for parcel 5 which has variants
- ⚠️ Many gaps in sequential numbering
- ⚠️ One potentially incorrect surface area value (5 (L) = 44,503 m²)

