export const today = () => new Date().toLocaleDateString("en-CA");
export function initial(name = "Guest") {
  return {
    profile: {
      name,
      currency: "LKR",
      timeout: 15
    },
    books: [{
      id: crypto.randomUUID(),
      name: "Personal wallet",
      kind: "Personal",
      currency: "LKR",
      budget: 0
    }, {
      id: crypto.randomUUID(),
      name: "Shopping wallet",
      kind: "Shopping",
      currency: "LKR",
      budget: 0
    }],
    transactions: []
  };
}
