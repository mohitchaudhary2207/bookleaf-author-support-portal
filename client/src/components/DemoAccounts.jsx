// DEMO-ONLY quick-fill panel for the isolated evaluation deployment. LoginPage imports this module lazily and only
// when VITE_SHOW_DEMO is on at build time, so a normal production build contains none of these strings.
const DEMO_AUTHOR_PASSWORD = 'Author@123';
const DEMO_ADMIN_PASSWORD = 'Admin@123';

const DEMO_AUTHORS = [
  ['Priya Sharma', 'priya.sharma@email.com', '2 books · pending royalty'],
  ['Rohit Kapoor', 'rohit.kapoor@email.com', '2 books · top seller'],
  ['Ananya Reddy', 'ananya.reddy@email.com', 'never paid yet'],
  ['Vikram Joshi', 'vikram.joshi@email.com', 'poetry + self-help'],
  ['Meera Nair', 'meera.nair@email.com', '2 books'],
  ['Arjun Malhotra', 'arjun.malhotra@email.com', 'never paid yet'],
  ['Sneha Kulkarni', 'sneha.kulkarni@email.com', '1 book in production'],
  ['Farhan Sheikh', 'farhan.sheikh@email.com', 'fully paid'],
  ['Kavita Deshmukh', 'kavita.deshmukh@email.com', 'in production + below payout threshold'],
  ['Diya Chatterjee', 'diya.chatterjee@email.com', '2 books'],
];
const DEMO_ADMINS = [['Riya Mehta (Support Lead)', 'admin@bookleaf.com'], ['Aman Verma (Support)', 'support@bookleaf.com']];

export default function DemoAccounts({ onPick }) {
  return (
    <details className="demo">
      <summary>Demo accounts (evaluation only)</summary>
      <p className="muted small">Demo-only credentials for the isolated evaluation deployment: authors <code>{DEMO_AUTHOR_PASSWORD}</code> · admins <code>{DEMO_ADMIN_PASSWORD}</code></p>
      <h4>Support team</h4>
      <div className="demo-list">
        {DEMO_ADMINS.map(([name, email]) => (
          <button type="button" key={email} className="demo-item" onClick={() => onPick(email, DEMO_ADMIN_PASSWORD)}><strong>{name}</strong><span>{email}</span></button>
        ))}
      </div>
      <h4>Authors</h4>
      <div className="demo-list">
        {DEMO_AUTHORS.map(([name, email, note]) => (
          <button type="button" key={email} className="demo-item" onClick={() => onPick(email, DEMO_AUTHOR_PASSWORD)}><strong>{name}</strong><span>{note}</span></button>
        ))}
      </div>
    </details>
  );
}
