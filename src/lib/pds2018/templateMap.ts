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
  date_of_birth: Roi;
};

// Normalized ROIs (0..1) for CS Form No. 212 Revised 2018, page 1.
// These are conservative starter boxes for the Personal Information name rows.
export const PDS2018_PAGE1_ROIS: Page1Rois = {
  surname: { x: 0.23, y: 0.175, w: 0.36, h: 0.040 },
  first_name: { x: 0.23, y: 0.215, w: 0.36, h: 0.040 },
  middle_name: { x: 0.23, y: 0.255, w: 0.36, h: 0.040 },
  date_of_birth: { x: 0.23, y: 0.295, w: 0.20, h: 0.045 },
};
