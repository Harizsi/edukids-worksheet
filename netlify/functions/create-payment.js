const { getStore, connectLambda } = require("@netlify/blobs");
const { PRODUCTS, calculatePrice } = require("./_shared/products");

exports.handler = async (event) => {
    // Wajib untuk classic "exports.handler" functions - tanpa ni Netlify Blobs
    // akan throw MissingBlobsEnvironmentError.
    connectLambda(event);

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch (err) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Payload tidak sah." })
        };
    }

    const { products, customer, return_url } = payload;

    if (!Array.isArray(products) || products.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Sila pilih sekurang-kurangnya satu set." })
        };
    }

    // Sahkan setiap product ID wujud dalam katalog kita
    const validProducts = products.filter((id) => PRODUCTS[id]);
    if (validProducts.length !== products.length) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Terdapat produk yang tidak sah." })
        };
    }

    if (!customer || !customer.name || !customer.email) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Nama dan email diperlukan." })
        };
    }

    // JANGAN percaya harga dari browser - kira semula di server
    const amountRM = calculatePrice(validProducts.length);
    const amountCents = amountRM * 100;

    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const callbackUrl = `${siteUrl}/.netlify/functions/payment-callback`;

    const isSandbox = process.env.TOYYIBPAY_SANDBOX === "true";
    const toyyibBase = isSandbox
        ? "https://dev.toyyibpay.com"
        : "https://toyyibpay.com";

    const billForm = new URLSearchParams({
        userSecretKey: process.env.TOYYIBPAY_SECRET_KEY,
        categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE,
        billName: "EduKids Worksheet",
        billDescription: `Pembelian ${validProducts.length} set worksheet`,
        billPriceSetting: "1",
        billPayorInfo: "1",
        billAmount: String(amountCents),
        billReturnUrl: return_url,
        billCallbackUrl: callbackUrl,
        billExternalReferenceNo: orderId,
        billTo: customer.name,
        billEmail: customer.email,
        billPhone: customer.phone || "",
        billPaymentChannel: "0"
    });

    let toyyibJson;
    try {
        const res = await fetch(`${toyyibBase}/index.php/api/createBill`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: billForm.toString()
        });
        toyyibJson = await res.json();
    } catch (err) {
        console.error("ToyyibPay createBill error:", err);
        return {
            statusCode: 502,
            body: JSON.stringify({ error: "Tidak dapat menghubungi ToyyibPay." })
        };
    }

    if (!Array.isArray(toyyibJson) || !toyyibJson[0] || !toyyibJson[0].BillCode) {
        console.error("ToyyibPay createBill failed:", toyyibJson);
        return {
            statusCode: 502,
            body: JSON.stringify({
                error: "Gagal cipta bill ToyyibPay.",
                detail: toyyibJson
            })
        };
    }

    const billCode = toyyibJson[0].BillCode;

    // Simpan order (status pending) supaya callback & check-order boleh rujuk
    const store = getStore("orders");
    await store.setJSON(orderId, {
        orderId,
        billCode,
        products: validProducts,
        customer,
        amountRM,
        status: "pending",
        createdAt: new Date().toISOString()
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            payment_url: `${toyyibBase}/${billCode}`
        })
    };
};
