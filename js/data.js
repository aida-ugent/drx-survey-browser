export async function loadPapers() {
  const response = await fetch("papers/index.json");
  if (!response.ok) {
    throw new Error(`Failed to load papers/index.json: ${response.status}`);
  }
  return response.json();
}
