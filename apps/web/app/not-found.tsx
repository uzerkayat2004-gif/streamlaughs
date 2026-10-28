import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="standard-page quiet-empty">
      <span>◡</span>
      <h1>
        this little corner
        <br />
        isn’t yours to open.
      </h1>
      <p>Streamers can only see their own channel.</p>
      <Link className="button yellow" href="/dashboard">
        back to your crowd ↗
      </Link>
    </main>
  );
}
