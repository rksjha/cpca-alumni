// Connection to the portal's database (Supabase). Both values are public by design —
// the data is protected by the database's row-level security rules, not by hiding these.
// While these are empty the portal runs in read-only preview mode.
window.CPCA_CONFIG = {
  supabaseUrl: "",
  supabaseKey: ""
};
