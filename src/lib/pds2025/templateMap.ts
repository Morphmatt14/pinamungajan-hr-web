export type Roi = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Page1Rois = {
  surname: Roi;
  first_name: Roi;
  middle_name: Roi;
  name_extension: Roi;
  date_of_birth: Roi;
};

// Normalized ROIs (0..1) for CS Form No. 212 Revised 2025, page 1.
// These values are intentionally conservative and should be refined using the official template PDF render.
// They are designed to isolate the Personal Information name rows and avoid instruction/header text.
export const PDS2025_PAGE1_ROIS: Page1Rois = {
  // Row 2. SURNAME value cell
  surname: { x: 0.24, y: 0.165, w: 0.34, h: 0.035 },
  // FIRST NAME value cell
  first_name: { x: 0.24, y: 0.200, w: 0.34, h: 0.035 },
  // MIDDLE NAME value cell
  middle_name: { x: 0.24, y: 0.235, w: 0.34, h: 0.035 },
  // NAME EXTENSION (JR, SR) small cell at right of the name table row area
  name_extension: { x: 0.78, y: 0.200, w: 0.18, h: 0.035 },
  // DATE OF BIRTH value cell (left block)
  date_of_birth: { x: 0.24, y: 0.270, w: 0.18, h: 0.040 },
};
