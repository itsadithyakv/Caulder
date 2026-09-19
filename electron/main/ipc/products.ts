import { CHANNELS } from "@shared/ipc";
import { getDatabase } from "../db/connection";
import { assertId, handle } from "./handle";
import {
  buildCatalogue,
  editPrice,
  editProduct,
  forPicking,
  newPrice,
  newProduct,
  productDetail,
  removePrice,
  removeProduct,
} from "../services/products";

/**
 * The catalogue and the price book from the window. A change hands back the
 * product as the screen is looking at it - its prices, what it was charged
 * at, who bought it - except a delete, which hands back the catalogue,
 * because the thing being looked at has gone.
 */
export function registerProductHandlers(): void {
  const companyOf = (value: unknown) => assertId(value, "company id");
  const productOf = (value: unknown) => assertId(value, "product id");

  handle(CHANNELS.productsCatalogue, (_event, companyId: unknown) =>
    buildCatalogue(getDatabase(), companyOf(companyId)),
  );

  handle(CHANNELS.productsDetail, (_event, id: unknown) => productDetail(getDatabase(), productOf(id)));

  handle(CHANNELS.productsPickable, (_event, companyId: unknown) => forPicking(getDatabase(), companyOf(companyId)));

  handle(CHANNELS.productsCreate, (_event, companyId: unknown, raw: unknown) =>
    newProduct(getDatabase(), companyOf(companyId), raw),
  );

  handle(CHANNELS.productsUpdate, (_event, id: unknown, raw: unknown) =>
    editProduct(getDatabase(), productOf(id), raw),
  );

  handle(CHANNELS.productsDelete, (_event, id: unknown) => removeProduct(getDatabase(), productOf(id)));

  handle(CHANNELS.productsAddPrice, (_event, productId: unknown, raw: unknown) =>
    newPrice(getDatabase(), productOf(productId), raw),
  );

  handle(CHANNELS.productsUpdatePrice, (_event, id: unknown, raw: unknown) =>
    editPrice(getDatabase(), assertId(id, "price id"), raw),
  );

  handle(CHANNELS.productsDeletePrice, (_event, id: unknown) =>
    removePrice(getDatabase(), assertId(id, "price id")),
  );
}
