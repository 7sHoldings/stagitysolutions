// Shared (client + server) Form I-9 definitions. Wording follows the USCIS Form I-9 and the
// "Lists of Acceptable Documents". Review against the current USCIS edition when it changes.

export type CitizenshipStatus = "citizen" | "noncitizen_national" | "lpr" | "authorized_alien";

export const citizenshipOptions: { value: CitizenshipStatus; label: string }[] = [
  { value: "citizen", label: "1. A citizen of the United States" },
  { value: "noncitizen_national", label: "2. A noncitizen national of the United States" },
  { value: "lpr", label: "3. A lawful permanent resident" },
  { value: "authorized_alien", label: "4. A noncitizen (other than Item Numbers 2 and 3 above) authorized to work" },
];

export type Section1 = {
  lastName: string;
  firstName: string;
  middleInitial: string;
  otherLastNames: string;
  address: string;
  apt: string;
  city: string;
  state: string;
  zip: string;
  dob: string; // yyyy-mm-dd
  ssn: string; // digits only
  email: string;
  phone: string;
  status: CitizenshipStatus;
  lprNumber: string; // USCIS / A-Number (status 3)
  workAuthExpires: string; // yyyy-mm-dd or "N/A" (status 4)
  alienIdType: "uscis" | "i94" | "passport" | ""; // status 4
  alienUscisNumber: string;
  i94Number: string;
  foreignPassportNumber: string;
  passportCountry: string;
  signature: string; // typed full legal name = electronic signature
  signedAt: string; // ISO timestamp (server set)
  noPreparer: boolean;
  docChoice: { mode: "A" | "BC"; a: string; b: string; c: string };
};

export type DocEntry = {
  title: string;
  issuingAuthority: string;
  number: string;
  expires: string; // yyyy-mm-dd or "N/A"
};

export type Section2 = {
  documents: { listA: DocEntry[]; listB: DocEntry | null; listC: DocEntry | null };
  firstDay: string;
  additionalInfo: string;
  altProcedure: boolean;
  videoCallAt: string;
  repLastName: string;
  repFirstName: string;
  repTitle: string;
  signature: string;
  signedAt: string;
  businessName: string;
  businessAddress: string;
};

export const listADocs = [
  "U.S. Passport",
  "U.S. Passport Card",
  "Permanent Resident Card (Form I-551)",
  "Foreign passport with temporary I-551 stamp or printed notation on a machine-readable immigrant visa",
  "Employment Authorization Document (Form I-766)",
  "Foreign passport with Form I-94 or I-94A (nonimmigrant authorized to work)",
  "Passport from the Federated States of Micronesia or the Republic of the Marshall Islands with Form I-94",
];

export const listBDocs = [
  "Driver's license issued by a U.S. state or outlying possession",
  "ID card issued by federal, state or local government agency",
  "School ID card with a photograph",
  "Voter's registration card",
  "U.S. Military card or draft record",
  "Military dependent's ID card",
  "U.S. Coast Guard Merchant Mariner Card",
  "Native American tribal document",
  "Driver's license issued by a Canadian government authority",
  "School record or report card (under age 18)",
  "Clinic, doctor or hospital record (under age 18)",
  "Day-care or nursery school record (under age 18)",
];

export const listCDocs = [
  "U.S. Social Security account number card (without employment restrictions)",
  "Certification of report of birth issued by the U.S. Department of State (Form DS-1350, FS-545, FS-240)",
  "Original or certified copy of a U.S. birth certificate bearing an official seal",
  "Native American tribal document",
  "U.S. Citizen ID Card (Form I-197)",
  "Identification Card for Use of Resident Citizen in the United States (Form I-179)",
  "Employment authorization document issued by the Department of Homeland Security",
];

export const usStates = [
  "AL","AK","AS","AZ","AR","CA","CO","CT","DE","DC","FM","FL","GA","GU","HI","ID","IL","IN","IA","KS","KY","LA","ME","MH","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","MP","OH","OK","OR","PW","PA","PR","RI","SC","SD","TN","TX","UT","VT","VI","VA","WA","WV","WI","WY","AA","AE","AP",
];

export const statusLabels: Record<string, string> = {
  invited: "Waiting for employee",
  section1_complete: "Ready for HR review",
  section2_complete: "Create E-Verify case",
  everify_submitted: "E-Verify submitted",
  closed: "Complete",
  cancelled: "Cancelled",
};

export const formatSsn = (ssn: string) => (ssn.length === 9 ? `${ssn.slice(0, 3)}-${ssn.slice(3, 5)}-${ssn.slice(5)}` : ssn);
export const maskSsn = (ssn: string) => (ssn.length === 9 ? `•••-••-${ssn.slice(5)}` : "—");

/** I-9 retention: 3 years after first day, or 1 year after employment ends — whichever is later. */
export function retainUntil(firstDay: string | null, terminatedOn: string | null): string | null {
  if (!firstDay) return null;
  const hire = new Date(firstDay + "T00:00:00Z");
  hire.setUTCFullYear(hire.getUTCFullYear() + 3);
  if (!terminatedOn) return null; // still employed: keep
  const term = new Date(terminatedOn + "T00:00:00Z");
  term.setUTCFullYear(term.getUTCFullYear() + 1);
  return (hire > term ? hire : term).toISOString().slice(0, 10);
}
