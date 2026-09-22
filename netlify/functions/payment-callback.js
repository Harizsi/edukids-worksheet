const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const { PRODUCTS } = require("./_shared/products");

/*
   Ini URL yang Sir letak sebagai billCallbackUrl semasa create bill.
   ToyyibPay panggil URL ini dari SERVER dia (bukan browser customer),
   jadi ini sumber yang BOLEH DIPERCAYAI untuk sahkan pembayaran betul-betul berjaya.

   Callback tidak berfungsi di localhost - kena test di URL Netlify sebenar
   (boleh guna Netlify deploy preview / production URL).
*/
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const params = new URLSearchParams(event.body);
    const status = params.get("status");
    const orderId = params.get("order_id");
    const refno = params.get("refno");
    const receivedHash = params.get("hash");

    if (!orderId || !receivedHash) {
        return { statusCode: 400, body: "Missing parameters" };
    }

    // Wajib sahkan hash - jangan proses kalau tak sepadan
    const expectedHash = crypto
        .createHash("md5")
        .update(`${process.env.TOYYIBPAY_SECRET_KEY}${status}${orderId}${refno}ok`)
        .digest("hex");

    if (receivedHash !== expectedHash) {
        console.error("Hash tidak sepadan untuk order:", orderId);
        return { statusCode: 403, body: "Invalid hash" };
    }

    const store = getStore("orders");
    const order = await store.get(orderId, { type: "json" });

    if (!order) {
        console.error("Order tidak dijumpai:", orderId);
        return { statusCode: 404, body: "Order not found" };
    }

    if (status === "1") {
        // Pembayaran berjaya - sediakan link download
        const downloadLinks = order.products.map((id) => ({
            name: PRODUCTS[id].name,
            url: PRODUCTS[id].fileUrl
        }));

        await store.setJSON(orderId, {
            ...order,
            status: "paid",
            refno,
            paidAt: new Date().toISOString(),
            downloadLinks
        });
    } else {
        // status 2 = pending, 3 = fail
        await store.setJSON(orderId, {
            ...order,
            status: status === "3" ? "failed" : "pending",
            refno
        });
    }

    return { statusCode: 200, body: "OK" };
};
