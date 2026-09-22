const { getStore, connectLambda } = require("@netlify/blobs");

/*
   Dipanggil dari payment-success.html untuk semak status sebenar order,
   supaya link download hanya dipaparkan bila status = "paid" (disahkan
   oleh payment-callback.js), bukan terus dipercayai dari URL parameter.
*/
exports.handler = async (event) => {
    connectLambda(event);

    const orderId = event.queryStringParameters && event.queryStringParameters.order_id;

    if (!orderId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "order_id diperlukan." })
        };
    }

    const store = getStore("orders");
    const order = await store.get(orderId, { type: "json" });

    if (!order) {
        return {
            statusCode: 404,
            body: JSON.stringify({ status: "not_found" })
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            status: order.status,
            downloadLinks: order.downloadLinks || []
        })
    };
};
