export const currencies = ["LKR", "USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY", "AED", "SGD", "CHF", "CNY", "NZD", "SAR"];
export const digits = currency => new Intl.NumberFormat("en", {
  style: "currency",
  currency
}).resolvedOptions().maximumFractionDigits;
export const money = (amount, currency) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency
}).format(amount / 10 ** digits(currency));
