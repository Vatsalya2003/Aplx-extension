// Field mapping patterns and helpers for aplx form filling

const FIELD_PATTERNS = {
  firstName: {
    labels: ['first name', 'given name', 'first', 'fname', 'nombre'],
    names: ['firstname', 'first_name', 'fname', 'given_name', 'applicant_first_name', 'name_first'],
    autocomplete: ['given-name'],
  },
  lastName: {
    labels: ['last name', 'family name', 'surname', 'last', 'lname', 'apellido'],
    names: ['lastname', 'last_name', 'lname', 'family_name', 'surname', 'applicant_last_name', 'name_last'],
    autocomplete: ['family-name'],
  },
  fullName: {
    labels: ['full name', 'name (first and last)', 'your name'],
    names: ['name', 'applicant_name'],
  },
  email: {
    labels: ['email', 'e-mail', 'email address'],
    names: ['email', 'e-mail', 'applicant_email', 'email_address'],
    autocomplete: ['email'],
    inputTypes: ['email'],
  },
  phone: {
    labels: ['phone', 'telephone', 'mobile', 'cell', 'phone number'],
    names: ['phone', 'telephone', 'mobile', 'cell_phone', 'phone_number'],
    autocomplete: ['tel'],
    inputTypes: ['tel'],
  },
  phoneNumber: {
    labels: ['phone number', 'phone', 'telephone', 'mobile number', 'cell phone'],
    names: ['phoneNumber', 'phone_number', 'phone', 'telephone', 'mobile'],
    autocomplete: ['tel-national', 'tel-local'],
    inputTypes: ['tel', 'text'],
  },
  countryCode: {
    labels: ['country code', 'phone country code', 'dialing code'],
    names: ['country_code', 'countrycode', 'phone_country_code', 'dial_code'],
  },
  countryPhoneCode: {
    labels: ['country phone code', 'country code', 'phone code', 'dialing code'],
    names: ['countryPhoneCode', 'country_phone_code', 'countryCode', 'country_code', 'dialingCode'],
  },
  phoneType: {
    labels: ['phone type', 'device type', 'contact type'],
    names: ['phone_type', 'device_type', 'contact_type', 'phone_type'],
  },
  phoneDeviceType: {
    labels: ['phone device type', 'phone type', 'device type'],
    names: ['phoneDeviceType', 'phone_device_type', 'phone_type', 'deviceType'],
  },
  phoneExtension: {
    labels: ['phone extension', 'extension', 'ext', 'ext.', 'phone ext'],
    names: ['phoneExtension', 'phone_extension', 'extension', 'ext'],
  },
  address: {
    labels: ['address', 'address line 1', 'street address', 'address 1', 'street', 'full address'],
    names: ['address', 'addressLine1', 'address_line_1', 'street', 'street_address', 'address1'],
    autocomplete: ['street-address', 'address-line1'],
  },
  city: {
    labels: ['city', 'city / town', 'town', 'municipality'],
    names: ['city', 'town', 'municipality', 'city_name', 'addressCity', 'address_city'],
    autocomplete: ['address-level2'],
  },
  state: {
    labels: ['state', 'state/province', 'province', 'region', 'state / province'],
    names: ['state', 'province', 'region', 'state_province', 'addressState', 'address_state'],
    autocomplete: ['address-level1'],
  },
  location: {
    labels: ['location', 'current location', 'region'],
    names: ['location', 'current_location', 'region'],
  },
  country: {
    labels: ['country', 'country/region', 'country / region', 'country of residence', 'nationality'],
    names: ['country', 'country_region', 'country_name', 'addressCountry', 'address_country', 'nationality', 'country_of_residence'],
    autocomplete: ['country-name', 'country'],
  },
  pincode: {
    labels: ['pincode', 'pin code', 'zip', 'zip code', 'postal code', 'postcode', 'zip/postal'],
    names: ['pincode', 'pin_code', 'zip', 'zipcode', 'postal_code', 'postcode'],
    autocomplete: ['postal-code'],
  },
  postalCode: {
    labels: ['postal code', 'zip', 'zip code', 'postcode', 'pincode', 'zip/postal'],
    names: ['postalCode', 'postal_code', 'zip', 'zipCode', 'zip_code', 'pincode', 'postcode'],
    autocomplete: ['postal-code'],
  },
  linkedIn: {
    labels: ['linkedin', 'linkedin url', 'linkedin profile'],
    names: ['linkedin', 'linkedin_url', 'linkedin_profile'],
  },
  github: {
    labels: ['github', 'github url', 'github profile'],
    names: ['github', 'github_url'],
  },
  portfolio: {
    labels: ['portfolio', 'website', 'personal website', 'personal site'],
    names: ['portfolio', 'website', 'personal_url', 'personal_website'],
  },
  company: {
    labels: ['current company', 'current employer', 'company'],
    names: ['current_company', 'company', 'employer'],
  },
  title: {
    labels: ['current title', 'job title', 'current role', 'position'],
    names: ['current_title', 'job_title', 'title', 'position'],
  },
  salary: {
    labels: ['salary', 'expected salary', 'desired salary', 'compensation'],
    names: ['salary', 'expected_salary', 'desired_salary', 'compensation'],
  },
  startDate: {
    labels: ['start date', 'available start', 'earliest start', 'availability', 'available from'],
    names: ['start_date', 'available_date', 'earliest_start', 'availability'],
  },
  yearsExperience: {
    labels: ['years of experience', 'experience', 'total experience'],
    names: ['years_experience', 'experience_years', 'total_experience'],
  },
  visaSponsorship: {
    labels: ['require visa sponsorship', 'visa sponsorship', 'sponsorship required', 'without visa sponsorship', 'without sponsorship', 'eligible to work'],
    names: ['visa', 'visa_sponsorship', 'requires_visa', 'sponsorship'],
  },
  workAuthorization: {
    labels: ['work authorization', 'legally authorized', 'authorized to work', 'legally eligible', 'eligible to work in'],
    names: ['work_authorization', 'work_auth', 'work_status'],
  },
  willingToRelocate: {
    labels: ['willing to relocate', 'relocate', 'relocation'],
    names: ['willing_to_relocate', 'relocation', 'relocate'],
  },
  gender: {
    labels: ['gender', 'gender identity', 'what is your gender', 'sex', 'self-identify gender'],
    names: ['gender', 'gender_identity', 'sex', 'genderIdentity'],
  },
  ethnicity: {
    labels: ['ethnicity', 'race', 'race/ethnicity', 'ethnic background', 'racial identity', 'race ethnicity', 'self-identify race', 'hispanic or latino', 'demographic'],
    names: ['ethnicity', 'race', 'raceEthnicity', 'race_ethnicity', 'ethnicBackground', 'ethnic_background'],
  },
  veteranStatus: {
    labels: ['veteran', 'veteran status', 'protected veteran', 'self-identify as a veteran', 'veteran self-identification', 'veteran classification', 'vet status'],
    names: ['veteran', 'veteran_status', 'veteran_status_id', 'protected_veteran', 'veteranStatus', 'vetStatus', 'vet_status'],
  },
  disabilityStatus: {
    labels: ['disability', 'disability status', 'have a disability', 'check one of the boxes below', 'please check one of the boxes', 'self-identify disability', 'disability self-identification', 'voluntary self-identification of disability', 'form cc-305'],
    names: ['disability', 'disability_status', 'disability_status_id', 'have_disability', 'disabilityStatus', 'disStatus', 'dis_status'],
  },
  workplacePolicy: {
    labels: ['agree to comply', 'workplace polic', 'drug free', 'drug & alcohol', 'tobacco', 'i agree to', 'background check', 'agree to the terms', 'code of conduct'],
    names: ['workplace_policy', 'policy_agree', 'compliance', 'agree_comply', 'drug_free', 'background_check'],
  },
  pronouns: {
    labels: ['pronouns', 'preferred pronouns'],
    names: ['pronouns'],
  },
  coverLetter: {
    labels: ['cover letter'],
    names: ['cover_letter', 'coverletter'],
    elementHints: ['textarea', 'contenteditable'],
  },
  resume: {
    labels: ['resume', 'cv'],
    names: ['resume', 'cv', 'resume_upload', 'upload_resume'],
    inputTypes: ['file'],
  },
};

/**
 * Classify a form control into a known logical field using multiple signals.
 * @param {Object} desc
 * @param {string} desc.labelText
 * @param {string} desc.name
 * @param {string} desc.id
 * @param {string} desc.autocomplete
 * @param {string} desc.type
 * @param {string} desc.placeholder
 * @param {string} desc.contextText
 * @param {HTMLElement} desc.element
 * @returns {string|null}
 */
function classifyField(desc) {
  const label = (desc.labelText || '').toLowerCase();
  const nameId = (desc.name || desc.id || '').toLowerCase();
  const autocomplete = (desc.autocomplete || '').toLowerCase();
  const placeholder = (desc.placeholder || '').toLowerCase();
  const type = (desc.type || '').toLowerCase();
  const context = (desc.contextText || '').toLowerCase();

  let bestKey = null;
  let bestScore = 0;

  const textCandidates = [label, nameId, autocomplete, placeholder, context].filter(Boolean);

  for (const [key, pattern] of Object.entries(FIELD_PATTERNS)) {
    let score = 0;

    if (pattern.labels && label) {
      for (const l of pattern.labels) {
        if (label.includes(l)) score += 4;
        else if (placeholder.includes(l)) score += 2;
        else if (context.includes(l)) score += 1;
      }
    }

    if (pattern.names && nameId) {
      for (const n of pattern.names) {
        if (nameId === n) score += 5;
        else if (nameId.includes(n)) score += 3;
      }
    }

    if (pattern.autocomplete && autocomplete) {
      for (const a of pattern.autocomplete) {
        if (autocomplete === a) score += 5;
      }
    }

    if (pattern.inputTypes && type) {
      for (const t of pattern.inputTypes) {
        if (type === t) score += 3;
      }
    }

    if (pattern.elementHints && desc.element) {
      const tag = desc.element.tagName.toLowerCase();
      if (pattern.elementHints.includes(tag)) score += 2;
      if (desc.element.isContentEditable && pattern.elementHints.includes('contenteditable')) {
        score += 2;
      }
    }

    if (score > bestScore && score >= 4) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestKey;
}

// Expose globally for content scripts
window.ProfileFillFieldMapper = {
  FIELD_PATTERNS,
  classifyField,
};

