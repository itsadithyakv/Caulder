import { useCallback, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  PRODUCT_KINDS,
  PRODUCT_KIND_LABEL,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABEL,
  RECURRENCES,
  RECURRENCE_LABEL,
  describeRecurrence,
  marginOf,
  priceInput,
  productInput,
  type Catalogue,
  type Price,
  type PriceInput,
  type Product,
  type ProductDetail,
  type ProductInput,
} from "@shared/products";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine } from "@/components/ErrorLine";
import { useResource } from "@/lib/resource";
import { formatDay, formatValue } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { useOpenRef } from "@/lib/navigate";
import { BrainLinks } from "@/features/brain/BrainLinks";

/**
 * The catalogue, and one product.
 *
 * A product says two things that are worth keeping apart: what it asks - the
 * price book, which has a history because prices change - and what it
 * actually brought in, which is read off the invoice lines that named it. The
 * gap between them is the interesting number, so both are on the same page.
 */
export function ProductsTab({
  companyId,
  onOpenContact,
  openId,
  onOpen,
}: {
  companyId: string;
  onOpenContact: (leadId: string) => void;
  /** The product being looked at, kept by the screen so a reload does not close it. */
  openId: string | null;
  onOpen: (productId: string | null) => void;
}) {
  const fetch = useCallback(() => window.caulder.products.catalogue(companyId), [companyId]);
  const { data, error, busy, reload, setError } = useResource<Catalogue>(fetch);
  const [adding, setAdding] = useState(false);

  if (openId) {
    return (
      <ProductView
        productId={openId}
        onOpenContact={onOpenContact}
        onBack={() => {
          onOpen(null);
          reload();
        }}
        onGone={() => {
          onOpen(null);
          reload();
        }}
      />
    );
  }

  if (!data) return <ErrorLine>{error}</ErrorLine>;
  const money = (value: number) => formatValue(value, data.currency);

  async function add(input: ProductInput) {
    try {
      const made = await window.caulder.products.create(companyId, input);
      setAdding(false);
      reload();
      onOpen(made.product.id);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <Card
      title="Products"
      hint="What you sell, what it costs you, what you ask, and what people have actually paid."
      actions={
        !adding && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden />
            Add a product
          </button>
        )
      }
    >
      <ErrorLine>{error}</ErrorLine>
      {adding && <ProductForm busy={busy} onSubmit={add} onCancel={() => setAdding(false)} />}

      {data.products.length === 0 ? (
        !adding && (
          <EmptyState
            title="Nothing in the catalogue yet"
            body="A product is what you sell: a workshop, a licence, an hour. Its price goes in a price book, so a quote can pick it and a change of price is a new row rather than a rewrite."
          />
        )
      ) : (
        <ul className="money__list" aria-label="Products">
          {data.products.map((row) => {
            const margin = marginOf(row.current?.amount ?? null, row.cost);
            return (
              <li key={row.id} className="money__row product">
                <button type="button" className="money__main" onClick={() => onOpen(row.id)}>
                  <span className="money__number product__name">{row.name}</span>
                  <span className="money__who">
                    {PRODUCT_KIND_LABEL[row.kind]}
                    {row.unit && ` · per ${row.unit}`}
                    {row.status !== "live" && ` · ${PRODUCT_STATUS_LABEL[row.status].toLowerCase()}`}
                  </span>
                  <span className="money__when">
                    {row.sales.invoices === 0
                      ? "Not sold yet"
                      : `${money(row.sales.value)} on ${row.sales.invoices} ${
                          row.sales.invoices === 1 ? "invoice" : "invoices"
                        }`}
                  </span>
                </button>
                <span className="money__amount product__price">
                  {row.current ? (
                    <>
                      {money(row.current.amount)}
                      <span className="product__per"> {describeRecurrence(row.current.recurrence)}</span>
                    </>
                  ) : (
                    <span className="leadrow__missing">No price yet</span>
                  )}
                </span>
                <span className={`badge ${margin && margin.percent >= 0 ? "badge--ok" : "badge--neutral"}`}>
                  {margin ? `${margin.percent}% margin` : "No cost set"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ProductView({
  productId,
  onBack,
  onGone,
  onOpenContact,
}: {
  productId: string;
  onBack: () => void;
  onGone: () => void;
  onOpenContact: (leadId: string) => void;
}) {
  const fetch = useCallback(() => window.caulder.products.detail(productId), [productId]);
  const { data, error, busy, setError } = useResource<ProductDetail>(fetch);
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState<Price | "new" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const shown = detail ?? data;
  const openRef = useOpenRef();

  async function act(work: () => Promise<ProductDetail>, after?: () => void) {
    try {
      setDetail(await work());
      after?.();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  if (!shown) return <ErrorLine>{error}</ErrorLine>;
  const { product, sales } = shown;
  const money = (value: number) => formatValue(value, shown.currency);
  const current = shown.prices.find(
    (price) =>
      (!price.validFrom || price.validFrom <= shown.day) && (!price.validTo || price.validTo >= shown.day),
  );

  return (
    <div className="productview">
      <div className="detail__bar">
        <button type="button" className="btn btn--sm" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden />
          All products
        </button>
        <div className="detail__barActions">
          {!editing && (
            <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
              Edit the product
            </button>
          )}
          {!confirming ? (
            <button
              type="button"
              className="btn btn--sm btn--ghost btn--danger"
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
          ) : (
            <span className="detail__confirm">
              <span className="card__hint">Invoices keep their lines and their money.</span>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                disabled={busy}
                onClick={() =>
                  void window.caulder.products
                    .remove(product.id)
                    .then(onGone)
                    .catch((cause: unknown) => setError(messageOf(cause)))
                }
              >
                Delete
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          )}
        </div>
      </div>

      <ErrorLine>{error}</ErrorLine>

      <Card
        title={product.name}
        actions={<span className={`badge badge--${product.status === "live" ? "ok" : "neutral"}`}>{PRODUCT_STATUS_LABEL[product.status]}</span>}
      >
        {editing ? (
          <ProductForm
            product={product}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={(input) => act(() => window.caulder.products.update(product.id, input), () => setEditing(false))}
          />
        ) : (
          <>
            <dl className="facts">
              <Fact label="Kind" value={PRODUCT_KIND_LABEL[product.kind]} />
              <Fact label="Sold per" value={product.unit} />
              <Fact label="Costs us" value={product.cost === null ? null : money(product.cost)} />
              <Fact label="GST rate" value={product.taxRate === null ? null : `${product.taxRate}%`} />
              <Fact label="HSN or SAC" value={product.code} />
            </dl>
            {product.notes && <p className="detail__notesBody">{product.notes}</p>}
          </>
        )}
      </Card>

      <Card
        title="The price book"
        hint="What you ask, and when you asked it. A price that changed is a new row, so what was charged before still makes sense."
        actions={
          pricing === null && (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setPricing("new")}>
              <Plus size={15} aria-hidden />
              Add a price
            </button>
          )
        }
      >
        {pricing !== null && (
          <PriceForm
            price={pricing === "new" ? undefined : pricing}
            day={shown.day}
            busy={busy}
            onCancel={() => setPricing(null)}
            onSubmit={(input) =>
              act(
                () =>
                  pricing === "new"
                    ? window.caulder.products.addPrice(product.id, input)
                    : window.caulder.products.updatePrice(pricing.id, input),
                () => setPricing(null),
              )
            }
          />
        )}

        {shown.prices.length === 0 ? (
          pricing === null && (
            <p className="card__hint">No price yet, so a quote cannot pick it. Add what you ask for one.</p>
          )
        ) : (
          <ul className="money__list money__list--compact" aria-label="Prices">
            {shown.prices.map((price) => {
              const margin = marginOf(price.amount, product.cost);
              return (
                <li key={price.id} className="money__row">
                  <button type="button" className="money__main" onClick={() => setPricing(price)}>
                    <span className="money__number">{price.name}</span>
                    <span className="money__who">
                      {price.validFrom || price.validTo
                        ? `${price.validFrom ? `from ${formatDay(price.validFrom)}` : "until"}${
                            price.validTo ? ` to ${formatDay(price.validTo)}` : ""
                          }`
                        : "no dates"}
                    </span>
                    {margin && <span className="money__when">{money(margin.amount)} left after cost</span>}
                  </button>
                  <span className="money__amount">
                    {money(price.amount)}
                    <span className="product__per"> {describeRecurrence(price.recurrence)}</span>
                  </span>
                  {price.id === current?.id ? (
                    <span className="badge badge--ok">Now</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost btn--danger btn--icon"
                      aria-label={`Delete the price ${price.name}`}
                      disabled={busy}
                      onClick={() => void act(() => window.caulder.products.removePrice(price.id))}
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="What it has brought in" hint="From invoices that named it. Drafts and voids are left out.">
        <div className="money__figures">
          <Figure label="Sold" value={`${sales.quantity}${product.unit ? ` ${product.unit}${sales.quantity === 1 ? "" : "s"}` : ""}`} />
          <Figure label="Invoiced" value={money(sales.value)} />
          <Figure label="Margin" value={sales.margin === null ? "No cost set" : money(sales.margin)} />
          <Figure label="Last sold" value={sales.lastOn ? formatDay(sales.lastOn) : "Never"} />
        </div>

        {shown.charged.length > 0 && (
          <>
            <h3 className="card__title productview__sub">What it was charged at</h3>
            <ul className="money__list money__list--compact" aria-label="What it was charged at">
              {shown.charged.map((line, index) => (
                <li key={`${line.invoiceId}-${index}`} className="money__row">
                  <span className="money__main money__main--flat">
                    <span className="money__number">{formatDay(line.issuedOn)}</span>
                    <button type="button" className="linklike" onClick={() => onOpenContact(line.leadId)}>
                      {line.leadName}
                    </button>
                    <span className="money__when">
                      {line.quantity} × {money(line.unitPrice)}
                    </span>
                  </span>
                  <span className="money__amount">{money(Math.round(line.quantity * line.unitPrice))}</span>
                  <span className="badge badge--neutral">
                    {line.margin === null ? "—" : `${money(line.margin)} each`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {shown.buyers.length > 0 && (
          <>
            <h3 className="card__title productview__sub">Who bought it</h3>
            <ul className="money__list money__list--compact" aria-label="Who bought it">
              {shown.buyers.map((buyer) => (
                <li key={buyer.leadId} className="money__row">
                  <button type="button" className="money__main" onClick={() => onOpenContact(buyer.leadId)}>
                    <span className="money__number">{buyer.name}</span>
                    <span className="money__when">last on {formatDay(buyer.lastOn)}</span>
                  </button>
                  <span className="money__amount">{money(buyer.value)}</span>
                  <span className="badge badge--neutral">{buyer.quantity} sold</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* The pages that talk about it - pricing, objections - and the Map around it. */}
      <BrainLinks
        companyId={shown.product.companyId}
        kind="product"
        id={shown.product.id}
        onOpenPage={(id) => openRef({ kind: "page", id })}
        onOpenContact={onOpenContact}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="facts__row">
      <dt className="facts__label">{label}</dt>
      <dd className="facts__value">{value ?? <span className="leadrow__missing">Not set</span>}</dd>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="money__figure">
      <span className="money__figureLabel">{label}</span>
      <span className="money__figureValue">{value}</span>
    </div>
  );
}

function ProductForm({
  product,
  busy,
  onSubmit,
  onCancel,
}: {
  product?: Product;
  busy: boolean;
  onSubmit: (input: ProductInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [kind, setKind] = useState(product?.kind ?? "service");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [status, setStatus] = useState(product?.status ?? "live");
  const [cost, setCost] = useState(product?.cost === null || product === undefined ? "" : String(product.cost));
  const [taxRate, setTaxRate] = useState(product?.taxRate === null || product === undefined ? "" : String(product.taxRate));
  const [code, setCode] = useState(product?.code ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const number = (text: string) => (text.trim() === "" ? null : Number(text.replace(/[,\s]/g, "")));

  return (
    <form
      className="leadform anim-spring"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = productInput.safeParse({
          name,
          kind,
          unit: unit.trim() === "" ? null : unit,
          status,
          cost: number(cost),
          taxRate: number(taxRate),
          code: code.trim() === "" ? null : code,
          notes: notes.trim() === "" ? null : notes,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the product.");
          return;
        }
        void onSubmit(parsed.data);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="field">
        <label className="field__label" htmlFor="product-name">
          Name
        </label>
        <input
          id="product-name"
          className="input"
          value={name}
          maxLength={160}
          autoFocus
          disabled={busy}
          placeholder="Attendance workshop"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="leadform__row">
        <div className="field">
          <span className="field__label">Kind</span>
          <Chips
            aria-label="Kind"
            value={kind}
            disabled={busy}
            onChange={setKind}
            options={PRODUCT_KINDS.map((value) => ({ value, label: PRODUCT_KIND_LABEL[value] }))}
          />
        </div>
        <div className="field">
          <span className="field__label">Where it is up to</span>
          <Chips
            aria-label="Where it is up to"
            value={status}
            disabled={busy}
            onChange={setStatus}
            options={PRODUCT_STATUSES.map((value) => ({ value, label: PRODUCT_STATUS_LABEL[value] }))}
          />
        </div>
      </div>

      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="product-unit">
            Sold per
          </label>
          <input
            id="product-unit"
            className="input"
            value={unit}
            maxLength={40}
            disabled={busy}
            placeholder="workshop, seat, month, hour"
            onChange={(event) => setUnit(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="product-cost">
            What one costs us
          </label>
          <input
            id="product-cost"
            className="input"
            inputMode="numeric"
            value={cost}
            disabled={busy}
            onChange={(event) => setCost(event.target.value)}
          />
        </div>
      </div>

      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="product-tax">
            GST rate, %
          </label>
          <input
            id="product-tax"
            className="input"
            inputMode="decimal"
            value={taxRate}
            disabled={busy}
            onChange={(event) => setTaxRate(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="product-code">
            HSN or SAC
          </label>
          <input
            id="product-code"
            className="input"
            value={code}
            maxLength={40}
            disabled={busy}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="product-notes">
          Notes
        </label>
        <textarea
          id="product-notes"
          className="textarea"
          value={notes}
          maxLength={4000}
          disabled={busy}
          placeholder="What it is, who it is for, how you arrived at the price"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <ErrorLine>{error}</ErrorLine>
      <div className="leadform__actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {product ? "Save the product" : "Add the product"}
        </button>
      </div>
    </form>
  );
}

function PriceForm({
  price,
  day,
  busy,
  onSubmit,
  onCancel,
}: {
  price?: Price;
  day: string;
  busy: boolean;
  onSubmit: (input: PriceInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(price?.name ?? "Standard");
  const [amount, setAmount] = useState(price ? String(price.amount) : "");
  const [recurrence, setRecurrence] = useState(price?.recurrence ?? "once");
  const [validFrom, setValidFrom] = useState(price?.validFrom ?? "");
  const [validTo, setValidTo] = useState(price?.validTo ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="leadform anim-spring"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const parsed = priceInput.safeParse({
          name,
          amount: amount.trim() === "" ? undefined : Number(amount.replace(/[,\s]/g, "")),
          recurrence,
          validFrom: validFrom === "" ? null : validFrom,
          validTo: validTo === "" ? null : validTo,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the price.");
          return;
        }
        void onSubmit(parsed.data);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.preventDefault();
        onCancel();
      }}
      noValidate
    >
      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="price-name">
            What this price is
          </label>
          <input
            id="price-name"
            className="input"
            value={name}
            maxLength={80}
            autoFocus
            disabled={busy}
            placeholder="Standard, Schools, 500+ students"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="price-amount">
            Price
          </label>
          <input
            id="price-amount"
            className="input"
            inputMode="numeric"
            value={amount}
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="field__label">Charged</span>
        <Chips
          aria-label="Charged"
          value={recurrence}
          disabled={busy}
          onChange={setRecurrence}
          options={RECURRENCES.map((value) => ({ value, label: RECURRENCE_LABEL[value] }))}
        />
      </div>

      <div className="leadform__row">
        <div className="field">
          <label className="field__label" htmlFor="price-from">
            From
          </label>
          <input
            id="price-from"
            className="input"
            type="date"
            value={validFrom}
            disabled={busy}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="price-to">
            Until
          </label>
          <input
            id="price-to"
            className="input"
            type="date"
            value={validTo}
            min={validFrom || day}
            disabled={busy}
            onChange={(event) => setValidTo(event.target.value)}
          />
        </div>
      </div>
      <p className="card__hint">Leave the dates empty for &ldquo;what we ask&rdquo;. A dated price wins while it applies.</p>

      <ErrorLine>{error}</ErrorLine>
      <div className="leadform__actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {price ? "Save the price" : "Add the price"}
        </button>
      </div>
    </form>
  );
}
