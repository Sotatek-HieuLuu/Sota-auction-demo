import algosdk, {
  assignGroupID,
  encodeUint64
} from 'algosdk';

// export const verify = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
// ) => {
//   const params = await client.getTransactionParams().do();
//   params.flatFee = true;
//   console.log(params);
//   const note = new TextEncoder().encode('Please confirm to login: #3755'); //<-- key from BE
//   const trans = algosdk.makePaymentTxnWithSuggestedParams(activeAddress, activeAddress, 0, undefined, note, params);
//   const encode = algosdk.encodeUnsignedTransaction(trans);
//   const sign = await signTransactions([encode]);

//   console.log(sign[0].toString());
//   console.log(sign[0]);
//   //BE side
//   const stxn = algosdk.decodeSignedTransaction(sign[0]);
//   console.log('stxn', stxn);
//   console.log('note', new TextDecoder().decode(stxn.txn.note));

//   console.log('Valid? ', verifySignedTransaction(stxn));
// };
// function verifySignedTransaction(stxn: SignedTransaction) {
//   if (stxn.sig === undefined) return false;

//   const pk_bytes = stxn.txn.from.publicKey;

//   const sig_bytes = new Uint8Array(stxn.sig);

//   const txn_bytes = algosdk.encodeObj(stxn.txn.get_obj_for_encoding());
//   const msg_bytes = new Uint8Array(txn_bytes.length + 2);
//   msg_bytes.set(Buffer.from('TX'));
//   msg_bytes.set(txn_bytes, 2);

//   return nacl.sign.detached.verify(msg_bytes, sig_bytes, pk_bytes);
// }

export const createMainContractAndFullTest = async (
  client: algosdk.Algodv2,
  userAddress: string,
  signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
  sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
) => {
  const server = importAccount1();
  const admin = importAccount2();

  const contract = await getMainContract(client);

  //create app and send 0.1 to it
  const createApp = async () => {
    const appArgs = [algosdk.decodeAddress(server.addr).publicKey, algosdk.decodeAddress(admin.addr).publicKey];

    const onComplete = algosdk.OnApplicationComplete.NoOpOC;
    const params = await client.getTransactionParams().do();

    const txn = algosdk.makeApplicationCreateTxn(
      admin.addr,
      params,
      onComplete,
      contract.approvalCompile,
      contract.clearStateCompile,
      0,
      0,
      0,
      2,
      appArgs,
    );
    const txId = txn.txID().toString();

    const signedTxn = txn.signTxn(admin.sk);
    await client.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(client, txId, 4);
    const transactionResponse = await client.pendingTransactionInformation(txId).do();
    const appId = transactionResponse['application-index'];
    const appAddress = algosdk.getApplicationAddress(appId);

    console.log('appId', appId);
    console.log('appAddress', appAddress);
    //send 0.1 Algo
    const paymentParams = await client.getTransactionParams().do();

    const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
      admin.addr,
      appAddress,
      100000, //0.1 Algo
      undefined,
      undefined,
      paymentParams,
    );
    const paymentTxId = txn.txID().toString();

    const signedPaymentTxn = paymentTxn.signTxn(admin.sk);
    await client.sendRawTransaction(signedPaymentTxn).do();
    await algosdk.waitForConfirmation(client, paymentTxId, 4);
    return appId;
  };
  const appId = +(await createApp());
  const appAddress = algosdk.getApplicationAddress(appId);

  /////////////////////////////////////////////
  // test token full flow
  {
    const adminCreateToken = async () => {
      let makePaymentParams = await client.getTransactionParams().do();
      makePaymentParams.fee = 2 * algosdk.ALGORAND_MIN_TX_FEE;
      makePaymentParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      const appArgs = [
        new Uint8Array(Buffer.from('mint_token')),
        new Uint8Array(Buffer.from('Genshin Impact')),
        new Uint8Array(Buffer.from('Mora')),
        new Uint8Array(
          Buffer.from('https://ih1.redbubble.net/image.3051548549.5431/st,small,507x507-pad,600x600,f8f8f8.jpg'),
        ),
      ];

      //BE create transaction
      const makePaymentTransaction = algosdk.makePaymentTxnWithSuggestedParams(
        admin.addr,
        appAddress,
        100000 + 1 * 1000, //0.101 Algo
        undefined,
        undefined,
        makePaymentParams,
      );

      const mintTransaction = algosdk.makeApplicationNoOpTxn(admin.addr, makeApplicationParams, appId, appArgs, [
        admin.addr,
      ]);

      let txgroup = algosdk.assignGroupID([makePaymentTransaction, mintTransaction]);

      //now BE will sign

      await client.sendRawTransaction([txgroup[0].signTxn(admin.sk), txgroup[1].signTxn(admin.sk)]).do();

      await algosdk.waitForConfirmation(client, mintTransaction.txID(), 4);
      const transactionResponse = await client.pendingTransactionInformation(mintTransaction.txID()).do();
      console.log(transactionResponse);
      const assetId = algosdk.decodeUint64(transactionResponse.logs[1], 'safe');
      console.log('tokenId: ', assetId);
      return assetId;
    };

    const tokenId = await adminCreateToken();

    //user withdraw
    await new Promise((r) => setTimeout(r, 10000)); //sleep 10s
    const userWithdrawToken = async (amount: number) => {
      let optInParams = await client.getTransactionParams().do();
      optInParams.fee = 3 * algosdk.ALGORAND_MIN_TX_FEE;
      optInParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      const appArgs = [new Uint8Array(Buffer.from('withdraw_token')), encodeUint64(amount)];

      //BE create transaction
      const optInTransaction = algosdk.makeAssetTransferTxnWithSuggestedParams(
        userAddress,
        userAddress,
        undefined,
        undefined,
        0,
        undefined,
        tokenId,
        optInParams,
      );

      const withdrawTransaction = algosdk.makeApplicationNoOpTxn(
        server.addr,
        makeApplicationParams,
        appId,
        appArgs,
        [userAddress],
        undefined,
        [tokenId],
      );

      let txgroup = algosdk.assignGroupID([optInTransaction, withdrawTransaction]);

      const withdrawTransactionAtomic = txgroup[1];

      //now BE will sign
      const signedWithdrawTransactionAtomic = withdrawTransactionAtomic.signTxn(server.sk);

      const encodeTxn = encodeUnsignedTransactions(txgroup);
      const transactions = [encodeTxn[0], signedWithdrawTransactionAtomic];

      //user now will send
      const signedTxn = await signTransactions(transactions);
      const trans = await sendTransactions(signedTxn, 4);
    };
    await userWithdrawToken(2000000 /* 2 Mora */);

    //check balance user

    console.log('userAssetAfterWithdraw', await getAssetAmount(client, userAddress, tokenId));
    //deposit
    const userDepositToken = async (amount: number) => {
      let params = await client.getTransactionParams().do();
      params.fee = 1000;
      params.flatFee = true;
      const appArgs = [new Uint8Array(Buffer.from('deposit_token')), encodeUint64(amount)];

      const transferAsset = algosdk.makeAssetTransferTxnWithSuggestedParams(
        userAddress,
        appAddress,
        undefined,
        undefined,
        amount,
        undefined,
        tokenId,
        params,
      );
      const setupTxn = algosdk.makeApplicationNoOpTxn(userAddress, params, appId, appArgs, [userAddress], undefined, [
        tokenId,
      ]);
      const assign = algosdk.assignGroupID([transferAsset, setupTxn]);
      const encodeTxn = encodeUnsignedTransactions(assign);
      const signedTxn = await signTransactions(encodeTxn);
      const trans = await sendTransactions(signedTxn, 4);
    };
    await userDepositToken(1000000 /*1 Mora */);
    console.log('userAssetAfterDeposit', await getAssetAmount(client, userAddress, tokenId));
  }
  console.log('done test token');
  /////////////////////////////////////////////
  // test nft full flow
  {
    const userMintNFT = async () => {
      let makePaymentParams = await client.getTransactionParams().do();
      makePaymentParams.fee = 2 * algosdk.ALGORAND_MIN_TX_FEE;
      makePaymentParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      const appArgs = [
        new Uint8Array(Buffer.from('mint_nft')),
        new Uint8Array(Buffer.from('Venti')),
        new Uint8Array(Buffer.from('Venti')),
        new Uint8Array(
          Buffer.from('https://static.wikia.nocookie.net/gensin-impact/images/e/e1/Character_Venti_Game.png'),
        ),
      ];

      //BE create transaction
      const makePaymentTransaction = algosdk.makePaymentTxnWithSuggestedParams(
        userAddress,
        appAddress,
        100000 + 1 * 1000, //0.101 Algo
        undefined,
        undefined,
        makePaymentParams,
      );

      const mintTransaction = algosdk.makeApplicationNoOpTxn(server.addr, makeApplicationParams, appId, appArgs, [
        userAddress,
      ]);

      let txgroup = algosdk.assignGroupID([makePaymentTransaction, mintTransaction]);

      const mintTransactionAtomic = txgroup[1];

      //now BE will sign
      const signedAdminToUserAtomic = mintTransactionAtomic.signTxn(server.sk);

      const encodeTxn = encodeUnsignedTransactions(txgroup);
      const transactions = [encodeTxn[0], signedAdminToUserAtomic];

      const signedTransactions = await signTransactions(transactions);
      const trans = await sendTransactions(signedTransactions, 4);

      const transactionResponse = await client.pendingTransactionInformation(mintTransaction.txID()).do();
      console.log(transactionResponse);
      const assetId = algosdk.decodeUint64(transactionResponse.logs[1], 'safe');
      console.log('nftId: ', assetId);
      return assetId;
    };
    const nftId = await userMintNFT();

    console.log('sleep 10s zzzz...');
    await new Promise((r) => setTimeout(r, 10000)); //sleep 10s
    const userWithdrawNFT = async () => {
      let optInParams = await client.getTransactionParams().do();
      optInParams.fee = 3 * algosdk.ALGORAND_MIN_TX_FEE;
      optInParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      const appArgs = [new Uint8Array(Buffer.from('withdraw_nft'))];

      //BE create transaction
      const optInTransaction = algosdk.makeAssetTransferTxnWithSuggestedParams(
        userAddress,
        userAddress,
        undefined,
        undefined,
        0,
        undefined,
        nftId,
        optInParams,
      );

      const withdrawTransaction = algosdk.makeApplicationNoOpTxn(
        server.addr,
        makeApplicationParams,
        appId,
        appArgs,
        [userAddress],
        undefined,
        [nftId],
      );

      let txgroup = algosdk.assignGroupID([optInTransaction, withdrawTransaction]);

      const withdrawTransactionAtomic = txgroup[1];

      //now BE will sign
      const signedWithdrawTransactionAtomic = withdrawTransactionAtomic.signTxn(server.sk);

      const encodeTxn = encodeUnsignedTransactions(txgroup);
      const transactions = [encodeTxn[0], signedWithdrawTransactionAtomic];

      const signedTransactions = await signTransactions(transactions);
      const trans = await sendTransactions(signedTransactions, 4);
    };
    await userWithdrawNFT();

    console.log('userAssetAfterWithdraw', await getAssetAmount(client, userAddress, nftId));

    const userDepositNFT = async () => {
      let params = await client.getTransactionParams().do();
      params.fee = 1500; //3000
      params.flatFee = true;

      const appArgs = [new Uint8Array(Buffer.from('deposit_nft'))];

      //Txn
      const transferAsset = algosdk.makeAssetTransferTxnWithSuggestedParams(
        userAddress,
        appAddress,
        appAddress,
        undefined,
        1,
        undefined,
        nftId,
        params,
      );
      const setupTxn = algosdk.makeApplicationNoOpTxn(userAddress, params, appId, appArgs, [userAddress], undefined, [
        nftId,
      ]);
      const assign = algosdk.assignGroupID([transferAsset, setupTxn]);
      const encodeTxn = encodeUnsignedTransactions(assign);
      const signedTxn = await signTransactions(encodeTxn);
      const trans = await sendTransactions(signedTxn, 4);
    };
    await userDepositNFT();
    console.log('userAssetAfterDeposit', await getAssetAmount(client, userAddress, nftId));
  }
  console.log('done test nft');

  /////////////////////////////////////////////
  // test item full flow
  {
    const userMintItem = async () => {
      let makePaymentParams = await client.getTransactionParams().do();
      makePaymentParams.fee = 2 * algosdk.ALGORAND_MIN_TX_FEE;
      makePaymentParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      const appArgs = [
        new Uint8Array(Buffer.from('mint_item')),
        new Uint8Array(Buffer.from('WB')),
        new Uint8Array(Buffer.from('WB')),
        new Uint8Array(
          Buffer.from('https://static.wikia.nocookie.net/gensin-impact/images/0/04/Weapon_Whiteblind.png'),
        ),
      ];

      //BE create transaction
      const makePaymentTransaction = algosdk.makePaymentTxnWithSuggestedParams(
        userAddress,
        appAddress,
        100000 + 1 * 1000, //0.101 Algo
        undefined,
        undefined,
        makePaymentParams,
      );

      const mintTransaction = algosdk.makeApplicationNoOpTxn(server.addr, makeApplicationParams, appId, appArgs, [
        userAddress,
      ]);

      let txgroup = algosdk.assignGroupID([makePaymentTransaction, mintTransaction]);

      const mintTransactionAtomic = txgroup[1];

      //now BE will sign
      const signedAdminToUserAtomic = mintTransactionAtomic.signTxn(server.sk);

      const encodeTxn = encodeUnsignedTransactions(txgroup);
      const transactions = [encodeTxn[0], signedAdminToUserAtomic];

      const signedTransactions = await signTransactions(transactions);
      const trans = await sendTransactions(signedTransactions, 4);

      const transactionResponse = await client.pendingTransactionInformation(mintTransaction.txID()).do();
      console.log(transactionResponse);
      const assetId = algosdk.decodeUint64(transactionResponse.logs[1], 'safe');
      console.log('itemId: ', assetId);
      return assetId;
    };
    const itemId = await userMintItem();

    console.log('sleep 10s zzzz...');
    await new Promise((r) => setTimeout(r, 10000)); //sleep 10s
    const userWithdrawItem = async (amount: number) => {
      let optInParams = await client.getTransactionParams().do();
      optInParams.fee = 3 * algosdk.ALGORAND_MIN_TX_FEE;
      optInParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      const appArgs = [new Uint8Array(Buffer.from('withdraw_item')), algosdk.encodeUint64(amount)];

      //BE create transaction
      const optInTransaction = algosdk.makeAssetTransferTxnWithSuggestedParams(
        userAddress,
        userAddress,
        undefined,
        undefined,
        0,
        undefined,
        itemId,
        optInParams,
      );

      const withdrawTransaction = algosdk.makeApplicationNoOpTxn(
        server.addr,
        makeApplicationParams,
        appId,
        appArgs,
        [userAddress],
        undefined,
        [itemId],
      );

      let txgroup = algosdk.assignGroupID([optInTransaction, withdrawTransaction]);

      const withdrawTransactionAtomic = txgroup[1];

      //now BE will sign
      const signedWithdrawTransactionAtomic = withdrawTransactionAtomic.signTxn(server.sk);

      const encodeTxn = encodeUnsignedTransactions(txgroup);
      const transactions = [encodeTxn[0], signedWithdrawTransactionAtomic];

      const signedTransactions = await signTransactions(transactions);
      const trans = await sendTransactions(signedTransactions, 4);
    };

    await userWithdrawItem(3); // withdraw 3 ASA
    console.log('userAssetAfterWithdraw pt.1, should be 3', await getAssetAmount(client, userAddress, itemId));

    const userDepositItem = async (amount: number) => {
      let params = await client.getTransactionParams().do();
      params.fee = 1000;
      params.flatFee = true;

      const appArgs = [new Uint8Array(Buffer.from('deposit_item')), algosdk.encodeUint64(amount)];

      //Txn
      const transferAsset = algosdk.makeAssetTransferTxnWithSuggestedParams(
        userAddress,
        appAddress,
        undefined,
        undefined,
        amount,
        undefined,
        itemId,
        params,
      );
      const setupTxn = algosdk.makeApplicationNoOpTxn(userAddress, params, appId, appArgs, [userAddress], undefined, [
        itemId,
      ]);
      const assign = algosdk.assignGroupID([transferAsset, setupTxn]);
      const encodeTxn = encodeUnsignedTransactions(assign);
      const signedTxn = await signTransactions(encodeTxn);
      const trans = await sendTransactions(signedTxn, 4);
    };
    await userDepositItem(2);
    console.log('userAssetAfterDeposit, should be 1', await getAssetAmount(client, userAddress, itemId));

    // withdraw again
    await userWithdrawItem(3); // withdraw 3 ASA
    console.log('userAssetAfterWithdraw pt.2, should be 4', await getAssetAmount(client, userAddress, itemId));
  }
  console.log('done test item');
};

// TODO: test flow:
/*
1. Create, sell, buy asset
2. Create, sell, cancel sell
*/
// Marketplace to sell NFT
export const sellNFT = async (
  client: algosdk.Algodv2,
  sellerAddress: string,
  assetID: number,
  assetPrice: number,
  assetQuantity: number,
  signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
  sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
) => {

  const contract = await getMainContractMarketplace(client);
  //Create app
  const createApp = async () => {
    const appArgs = [
      algosdk.decodeAddress(sellerAddress).publicKey, 
      algosdk.encodeUint64(assetID), 
      algosdk.encodeUint64(assetPrice), 
      algosdk.encodeUint64(assetQuantity)
    ];

    const onComplete = algosdk.OnApplicationComplete.NoOpOC;
    const params = await client.getTransactionParams().do();
    const txn = algosdk.makeApplicationCreateTxn(
      sellerAddress,
      params,
      onComplete,
      contract.approvalCompile,
      contract.clearStateCompile,
      0,
      0,
      0,
      2,
      appArgs,
    );
    const txId = txn.txID().toString();

    const txnGroup = assignGroupID([txn]);
    const encodeTxn = encodeUnsignedTransactions(txnGroup);
    const signedTxn = await signTransactions(encodeTxn);
    const trans = await sendTransactions(signedTxn, 4);

    const transactionResponse = await client.pendingTransactionInformation(txId).do();
    const appId = transactionResponse['application-index'];
    const appAddress = algosdk.getApplicationAddress(appId);

    console.log('appId', appId);
    console.log('appAddress', appAddress);
    return appId;
  };
  const appId = +(await createApp());
  const appAddress = algosdk.getApplicationAddress(appId);

  /* Test on_sell NFT
    + Seller sends 0.1 Algo to Smart Contract
    + Smart Contract Opt-in to NFT
    + Seller sends NFT to SC
  */
  {
    const on_sell_asset = async () => {
      console.log("Start on sell asset");
      let makePaymentParams = await client.getTransactionParams().do();
      makePaymentParams.fee = 4 * algosdk.ALGORAND_MIN_TX_FEE;
      makePaymentParams.flatFee = true;

      let makeApplicationParams = await client.getTransactionParams().do();
      makeApplicationParams.fee = 0;
      makeApplicationParams.flatFee = true;

      let makeAssetTransferParams = await client.getTransactionParams().do();
      makeAssetTransferParams.fee = 1400; //3000
      makeAssetTransferParams.flatFee = true;
      //send 0.1 Algo and NFT to Smart Contract

      const appArgs = [
        new Uint8Array(Buffer.from('sell')), 
        encodeUint64(appId), 
        algosdk.decodeAddress(sellerAddress).publicKey, 
        algosdk.decodeAddress(sellerAddress).publicKey, 
        encodeUint64(assetID), 
        encodeUint64(assetQuantity)
      ];
      
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
        sellerAddress,
        appAddress,
        100000, //0.1 Algo
        undefined,
        undefined,
        makePaymentParams,
      );
      const sellTxn = algosdk.makeApplicationNoOpTxn(
        sellerAddress,
        makeApplicationParams,
        appId,
        appArgs,
        [sellerAddress],
        undefined,
        [assetID],
      );
      const transfetAsset = algosdk.makeAssetTransferTxnWithSuggestedParams(
        sellerAddress,
        appAddress,
        undefined,
        undefined,
        assetQuantity,
        undefined,
        assetID,
        makeAssetTransferParams,
      );

      let txgroup = algosdk.assignGroupID([paymentTxn, sellTxn, transfetAsset]);
      const encodeTxn = encodeUnsignedTransactions(txgroup);
      const signedTxn = await signTransactions(encodeTxn);
      const trans = await sendTransactions(signedTxn, 4);
    };
    await on_sell_asset();
    console.log("Done on sell asset");
  }
}

/* Test on_buy asset
  + Buyer send Algo to Smart Contract
  + Buyer opt-in asset
  + Smart contract send Algo to seller
  + Smart contract send ASA to buyer 
  + Delete app
*/
export const on_buy_asset = async (
  client: algosdk.Algodv2,
  appID: number,
  buyerAddress: string,
  assetPrice: number,
  assetID: number,
  signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
  sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
) => {
  console.log("Buyer start buy asset");
  const appArgs = [new Uint8Array(Buffer.from('buy')), encodeUint64(appID), algosdk.decodeAddress(buyerAddress).publicKey, encodeUint64(assetPrice)];
  const appAddress = algosdk.getApplicationAddress(appID);
  let makeApplicationParams = await client.getTransactionParams().do();
  makeApplicationParams.fee = 0;
  makeApplicationParams.flatFee = true;

  let makePaymentParams = await client.getTransactionParams().do();
  makePaymentParams.fee = 3 * algosdk.ALGORAND_MIN_TX_FEE;
  makePaymentParams.flatFee = true;

  const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
    buyerAddress,
    appAddress,
    assetPrice,
    undefined,
    undefined,
    makePaymentParams,
  );

  const transferAssetTxn = algosdk.makeApplicationDeleteTxn(
    buyerAddress,
    makeApplicationParams,
    appID,
    appArgs,
    [buyerAddress],
    undefined,
    [assetID],
  )

  let txgroup = algosdk.assignGroupID([paymentTxn, transferAssetTxn]);

  const encodeTxn = encodeUnsignedTransactions(txgroup);
  const signedTxn = await signTransactions(encodeTxn);
  const trans = await sendTransactions(signedTxn, 4);
  console.log("Buy successful");
};
// Test on_cancel sell asset
  /*
    + Smart Contract send remainder Algo and asset to seller
    + Delete app
  */
export const on_cancel_sell = async (
  client: algosdk.Algodv2,
  sellerAddress: string,
  appID: number,
  assetID: number,
  assetPrice: number,
  assetQuantity: number,
  signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
  sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
) => {
  console.log("Cancel sell asset");
  const admin = importAccount2();

  let makeApplicationParams = await client.getTransactionParams().do();
  makeApplicationParams.fee = 0;
  makeApplicationParams.flatFee = true;

  let makePaymentParams = await client.getTransactionParams().do();
  makePaymentParams.fee = 2 * algosdk.ALGORAND_MIN_TX_FEE;
  makePaymentParams.flatFee = true;

  const appArgs = [
    new Uint8Array(Buffer.from('cancel')), 
    encodeUint64(appID), 
    algosdk.decodeAddress(sellerAddress).publicKey, 
  ];
  
  const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
    sellerAddress,
    admin.addr,
    assetPrice,
    sellerAddress,
    undefined,
    makePaymentParams,
  )
  
  const cancelSellTxn = algosdk.makeApplicationDeleteTxn(
    sellerAddress,
    makeApplicationParams,
    appID,
    appArgs,
    [sellerAddress],
    undefined,
    [assetID],
  )

  let txgroup = algosdk.assignGroupID([paymentTxn, cancelSellTxn]);
  const encodeTxn = encodeUnsignedTransactions(txgroup);
  const signedTxn = await signTransactions(encodeTxn);
  const trans = await sendTransactions(signedTxn, 4);
  console.log("Cancel sell asset successful");
};


// export const createNFTGenerator = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
// ) => {
//   const contracts = await getNFTContracts(client);
//   const appArgs = [
//     new Uint8Array(Buffer.from('Character')),
//     algosdk.decodeAddress('SZ46DJPMFEDWQD3GBIL5IVCVIZCTDROPLJTZ24BA4AXKNTPKESQRPHITNQ').publicKey,
//   ]; //acc 1 is admin

//   const onComplete = algosdk.OnApplicationComplete.NoOpOC;
//   const params = await client.getTransactionParams().do();

//   const txn = algosdk.makeApplicationCreateTxn(
//     activeAddress,
//     params,
//     onComplete,
//     contracts.approvalCompile,
//     contracts.clearStateCompile,
//     0,
//     0,
//     7,
//     2,
//     appArgs,
//   );
//   const encodedTransaction = encodeUnsignedTransaction(txn);
//   const signedTxn = await signTransactions([encodedTransaction]);

//   const transactionResponse = await sendTransactions(signedTxn, 4);
//   const appId = transactionResponse['application-index'];

//   console.log('Created new app-id: ', appId);
//   const appAddress = algosdk.getApplicationAddress(appId);
//   console.log('App address: ', appAddress);

//   //send 0.1 Algo
//   const paymentParams = await client.getTransactionParams().do();

//   const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
//     activeAddress,
//     appAddress,
//     100000, //0.1 Algo
//     undefined,
//     undefined,
//     paymentParams,
//   );
//   const encodeTxn = algosdk.encodeUnsignedTransaction(paymentTxn);
//   const signTxn = await signTransactions([encodeTxn]);
//   const trans = await sendTransactions(signTxn, 4);

//   return appId;
// };

// export const createTokenGenerator = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
//   assetName: string,
//   assetUnitName: string,
//   assetUrl: string,
// ) => {
//   const contracts = await getTokenContracts(client);
//   const appArgs = [
//     algosdk.decodeAddress('SZ46DJPMFEDWQD3GBIL5IVCVIZCTDROPLJTZ24BA4AXKNTPKESQRPHITNQ').publicKey, //admin
//     algosdk.decodeAddress('JVBCGU2GX7H7Q52C7VABVQYGMIHPRXHAW76EJWARIX4C5RW26OWJQUIEPI').publicKey, //server
//   ]; //acc 1 is admin, and server address

//   const onComplete = algosdk.OnApplicationComplete.NoOpOC;
//   const params = await client.getTransactionParams().do();

//   const txn = algosdk.makeApplicationCreateTxn(
//     activeAddress,
//     params,
//     onComplete,
//     contracts.approvalCompile,
//     contracts.clearStateCompile,
//     0,
//     0,
//     7,
//     2,
//     appArgs,
//   );
//   const encodedTransaction = encodeUnsignedTransaction(txn);
//   const signedTxn = await signTransactions([encodedTransaction]);

//   const transactionResponse = await sendTransactions(signedTxn, 4);
//   const appId = transactionResponse['application-index'];

//   console.log('Created new app-id: ', appId);
//   const appAddress = algosdk.getApplicationAddress(appId);
//   console.log('App address: ', appAddress);

//   //send 0.1 Algo
//   const paymentParams = await client.getTransactionParams().do();

//   const paymentTxn = algosdk.makePaymentTxnWithSuggestedParams(
//     activeAddress,
//     appAddress,
//     100000, //0.1 Algo
//     undefined,
//     undefined,
//     paymentParams,
//   );

//   const encodeTxn = algosdk.encodeUnsignedTransaction(paymentTxn);
//   const signTxn = await signTransactions([encodeTxn]);
//   await sendTransactions(signTxn, 4);

//   //
//   //
//   //
//   //now will mint 1 asset1
//   const mintAssetAppArgs = [
//     new Uint8Array(Buffer.from('mint')),
//     new Uint8Array(Buffer.from(assetName)),
//     new Uint8Array(Buffer.from(assetUnitName)),
//     new Uint8Array(Buffer.from(assetUrl)),
//   ];

//   let mintAssetParams = await client.getTransactionParams().do();
//   // mintAssetParams.fee = 1500;
//   // mintAssetParams.flatFee = true;

//   const paymentMintAssetTxn = algosdk.makePaymentTxnWithSuggestedParams(
//     activeAddress,
//     appAddress,
//     100000 + 1000, //0.101 Algo
//     undefined,
//     undefined,
//     mintAssetParams,
//   );

//   const mintAssetTxn = algosdk.makeApplicationNoOpTxn(activeAddress, mintAssetParams, appId, mintAssetAppArgs, [
//     activeAddress,
//   ]);

//   //Assign
//   const assign = algosdk.assignGroupID([paymentMintAssetTxn, mintAssetTxn]);

//   //Encode
//   const encodeMintTxn = encodeUnsignedTransactions(assign);

//   //Sign
//   const signedMintTxn = await signTransactions(encodeMintTxn);
//   //Send
//   await sendTransactions(signedMintTxn, 4);

//   const res = await client.pendingTransactionInformation(mintAssetTxn.txID()).do();
//   console.log(res);

//   const type = new TextDecoder().decode(res.logs[0]);
//   const assetId = algosdk.decodeUint64(res.logs[1], 'safe');
//   const address = algosdk.encodeAddress(res.logs[2]);

//   console.log('-----------------');
//   console.log(type, assetId, address);
//   console.log('-----------------');

//   console.log('new token Id: ', assetId);
//   return { appId, assetId };
// };
// // export const createTransaction = async (client: algosdk.Algodv2, activeAddress: string): Promise<Transaction> => {
// //   const contracts = await getContracts(client);
// //   const appArgs = [
// //     new Uint8Array(Buffer.from('Character')),
// //     algosdk.decodeAddress('SZ46DJPMFEDWQD3GBIL5IVCVIZCTDROPLJTZ24BA4AXKNTPKESQRPHITNQ').publicKey,
// //   ]; //acc 1 is admin

// //   const onComplete = algosdk.OnApplicationComplete.NoOpOC;
// //   const params = await client.getTransactionParams().do();

// //   const txn = algosdk.makeApplicationCreateTxn(
// //     activeAddress,
// //     params,
// //     onComplete,
// //     contracts.approvalCompile,
// //     contracts.clearStateCompile,
// //     0,
// //     0,
// //     7,
// //     2,
// //     appArgs,
// //   );

// //   return txn;
// // };

// // export const createAuctionApp = async (
// //   txn: Transaction,
// //   client: algosdk.Algodv2,
// //   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
// //   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
// //   encodedTransaction: Uint8Array,
// // ) => {
// //   const txId = txn.txID().toString();
// //   console.log('a');

// //   const signedTxn = await signTransactions([encodedTransaction]);

// //   console.log('Signed transaction with txID: %s', txId);
// //   console.log('Signed transaction with signedTxn: %s', typeof signedTxn, signedTxn);

// //   const transactionResponse = await sendTransactions(signedTxn, 4);
// //   console.log('trans; ', transactionResponse);

// //   const appId = transactionResponse['application-index'];
// //   console.log('Created new app-id: ', appId);
// //   return appId;
// // };

// export const mintAsset = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
//   appId: number,
//   assetUintName: string,
//   assetUrl: string,
// ) => {
//   const params = await client.getTransactionParams().do();
//   const fundingAmount = 350000;

//   const appArgs = [
//     new Uint8Array(Buffer.from('mint')),
//     new Uint8Array(Buffer.from(assetUintName)),
//     new Uint8Array(Buffer.from(assetUrl)),
//   ];

//   const appAddr = algosdk.getApplicationAddress(appId);
//   console.log('appAddress: ', appAddr);

//   //Txn
//   const fundAppTxn = algosdk.makePaymentTxnWithSuggestedParams(
//     activeAddress,
//     appAddr,
//     fundingAmount,
//     undefined,
//     undefined,
//     params,
//   );

//   const setupTxn = algosdk.makeApplicationNoOpTxn(activeAddress, params, appId, appArgs, [activeAddress]);

//   //Assign
//   const assign = algosdk.assignGroupID([fundAppTxn, setupTxn]);

//   //Encode
//   const encodeTxn = encodeUnsignedTransactions(assign);

//   //Sign
//   const signedTxn = await signTransactions(encodeTxn);
//   //Send
//   const trans = await sendTransactions(signedTxn, 4);
//   console.log('trans; ', trans);
//   console.log(fundAppTxn);
//   const res = await client.pendingTransactionInformation(setupTxn.txID()).do();
//   console.log(res);

//   const type = new TextDecoder().decode(res.logs[0]);
//   const assetId = algosdk.decodeUint64(res.logs[1], 'safe');
//   const address = algosdk.encodeAddress(res.logs[2]);

//   console.log('-----------------');
//   console.log(type, assetId, address);
//   console.log('-----------------');

//   console.log('new asset Id: ', assetId);
//   return assetId;
// };

// export const withdrawAsset = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
//   appId: number,
//   assetId: number,
// ) => {
//   const params = await client.getTransactionParams().do();

//   let appArgs = [];
//   appArgs.push(new Uint8Array(Buffer.from('withdraw')));

//   const appAddr = algosdk.getApplicationAddress(appId);
//   console.log('appAddress: ', appAddr);

//   //Txn
//   const optInAsset = algosdk.makeAssetTransferTxnWithSuggestedParams(
//     activeAddress,
//     activeAddress,
//     undefined,
//     undefined,
//     0,
//     undefined,
//     assetId,
//     params,
//   );
//   const setupTxn = algosdk.makeApplicationNoOpTxn(activeAddress, params, appId, appArgs, [activeAddress], undefined, [
//     assetId,
//   ]);

//   //Assign
//   const assign = algosdk.assignGroupID([optInAsset, setupTxn]);

//   //Encode
//   const encodeTxn = encodeUnsignedTransactions(assign);

//   //Sign
//   const signedTxn = await signTransactions(encodeTxn);
//   //Send
//   const trans = await sendTransactions(signedTxn, 4);
//   console.log('trans; ', trans);
//   const res = await client.pendingTransactionInformation(setupTxn.txID()).do();
//   console.log(res);

//   const type = new TextDecoder().decode(res.logs[0]);
//   const assetIdxx = algosdk.decodeUint64(res.logs[1], 'safe');
//   const address = algosdk.encodeAddress(res.logs[2]);

//   console.log('-----------------');
//   console.log(type, assetIdxx, address);
//   console.log('-----------------');
// };

// export const depositAsset = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
//   appId: number,
//   assetId: number,
// ) => {
//   const params = await client.getTransactionParams().do();

//   let appArgs = [];
//   appArgs.push(new Uint8Array(Buffer.from('deposit')));

//   const appAddr = algosdk.getApplicationAddress(appId);
//   console.log('appAddress: ', appAddr);

//   //Txn
//   const transferAsset = algosdk.makeAssetTransferTxnWithSuggestedParams(
//     activeAddress,
//     appAddr,
//     appAddr,
//     undefined,
//     1,
//     undefined,
//     assetId,
//     params,
//   );
//   const setupTxn = algosdk.makeApplicationNoOpTxn(activeAddress, params, appId, appArgs, [activeAddress], undefined, [
//     assetId,
//   ]);

//   //Assign
//   const assign = algosdk.assignGroupID([transferAsset, setupTxn]);

//   //Encode
//   const encodeTxn = encodeUnsignedTransactions(assign);

//   //Sign
//   const signedTxn = await signTransactions(encodeTxn);
//   //Send
//   const trans = await sendTransactions(signedTxn, 4);
//   console.log('trans; ', trans);
//   const res = await client.pendingTransactionInformation(setupTxn.txID()).do();
//   console.log(res);

//   const type = new TextDecoder().decode(res.logs[0]);
//   const assetIdxx = algosdk.decodeUint64(res.logs[1], 'safe');
//   const address = algosdk.encodeAddress(res.logs[2]);

//   console.log('-----------------');
//   console.log(type, assetIdxx, address);
//   console.log('-----------------');
// };

// export const atomicMultiUser = async (
//   client: algosdk.Algodv2,
//   activeAddress: string,
//   signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
//   sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
// ) => {
//   // user send admin 2 algo, admin send user assets
//   const admin = importAccount();
//   const adminClient = importClient();

//   let userToAdminParams = await client.getTransactionParams().do();
//   userToAdminParams.fee = 2 * algosdk.ALGORAND_MIN_TX_FEE;
//   userToAdminParams.flatFee = true;

//   let adminToUserParams = await client.getTransactionParams().do();
//   adminToUserParams.fee = 0;
//   adminToUserParams.flatFee = true;

//   //BE create transaction
//   const userToAdmin = algosdk.makePaymentTxnWithSuggestedParams(
//     activeAddress,
//     admin.addr,
//     200000,
//     undefined,
//     undefined,
//     userToAdminParams,
//   );
//   const adminToUser = algosdk.makeAssetTransferTxnWithSuggestedParams(
//     admin.addr,
//     activeAddress,
//     undefined,
//     undefined,
//     1,
//     undefined,
//     150043427,
//     adminToUserParams,
//   );

//   let txgroup = algosdk.assignGroupID([userToAdmin, adminToUser]);

//   const userToAdminAtomic = txgroup[0];
//   const adminToUserAtomic = txgroup[1];

//   console.log('txgroup', txgroup);

//   console.log('userToAdminAtomic', userToAdminAtomic);
//   console.log('adminToUserAtomic', adminToUserAtomic);
//   //now BE will sign
//   const signedAdminToUserAtomic = adminToUserAtomic.signTxn(admin.sk);

//   //BE send transaction to FE to sign
//   // const encodeUserToAdminAtomic = algosdk.encodeUnsignedTransaction(userToAdminAtomic);
//   // const signedUserToAdminAtomic = await signTransactions([encodeUserToAdminAtomic]);

//   const encodeTxn = encodeUnsignedTransactions(txgroup);

//   console.log('encodeTxn', encodeTxn);

//   //1
//   // const signedUserToAdminAtomic = await signTransactions([encodeTxn[0]]);
//   //2
//   const signedUserToAdminAtomic = await signTransactions([encodeTxn[0], signedAdminToUserAtomic]);
//   //3
//   // const signedUserToAdminAtomic = await signTransactions(encodeTxn);

//   // const tx = await adminClient.sendRawTransaction([signedUserToAdminAtomic[0], signedAdminToUserAtomic]).do();

//   // console.log('Transaction : ' + tx.txId);

//   // // Wait for transaction to be confirmed
//   // const confirmedTxn = await algosdk.waitForConfirmation(adminClient, tx.txId, 4);
//   // //Get the completed Transaction
//   // console.log('Transaction ' + tx.txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

//   //

//   //maybe FE will send
//   const trans = await sendTransactions(signedUserToAdminAtomic, 4);
//   console.log('trans; ', trans);
// };

// export const readGlobalState = async (client: algosdk.Algodv2, appId: number) => {
//   try {
//     let applicationInfoResponse = await client.getApplicationByID(appId).do();
//     console.log(applicationInfoResponse);
//     let globalState = applicationInfoResponse['params']['global-state'];
//     return globalState.map((state: any) => {
//       return state;
//     });
//   } catch (err) {
//     console.log(err);
//   }
// };

// not to export

const encodeUnsignedTransactions = (txns: algosdk.Transaction[]) => {
  let res = [];
  for (let txn of txns) {
    res.push(algosdk.encodeUnsignedTransaction(txn));
  }
  return res;
};

const getAssetAmount = async (client: algosdk.Algodv2, userAddress: string, assetId: number) => {
  const userInfo = await client.accountInformation(userAddress).do();
  const assetInfos = userInfo.assets.filter((asset: any) => {
    if (asset['asset-id'] === assetId) return asset.amount;
  });
  if (assetInfos[0]) {
    return assetInfos[0].amount;
  }

  return 0;
};

const compileProgram = async (client: algosdk.Algodv2, program: any) => {
  let encoder = new TextEncoder();
  let programBytes = encoder.encode(program);
  let compileResponse = await client.compile(programBytes).do();
  let compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'));
  return compiledBytes;
};

const getMainContract = async (client: algosdk.Algodv2) => {
  const approvalProgram =
    '#pragma version 5\ntxn ApplicationID\nint 0\n==\nbnz main_l24\ntxn OnCompletion\nint NoOp\n==\nbnz main_l5\ntxn OnCompletion\nint OptIn\n==\ntxn OnCompletion\nint CloseOut\n==\n||\ntxn OnCompletion\nint UpdateApplication\n==\n||\nbnz main_l4\nerr\nmain_l4:\nint 0\nreturn\nmain_l5:\ntxna ApplicationArgs 0\nbyte "mint_token"\n==\nbnz main_l23\ntxna ApplicationArgs 0\nbyte "withdraw_token"\n==\nbnz main_l22\ntxna ApplicationArgs 0\nbyte "deposit_token"\n==\nbnz main_l21\ntxna ApplicationArgs 0\nbyte "mint_nft"\n==\nbnz main_l20\ntxna ApplicationArgs 0\nbyte "withdraw_nft"\n==\nbnz main_l19\ntxna ApplicationArgs 0\nbyte "deposit_nft"\n==\nbnz main_l18\ntxna ApplicationArgs 0\nbyte "mint_item"\n==\nbnz main_l17\ntxna ApplicationArgs 0\nbyte "withdraw_item"\n==\nbnz main_l16\ntxna ApplicationArgs 0\nbyte "deposit_item"\n==\nbnz main_l15\nerr\nmain_l15:\nint 0\ngtxns AssetAmount\ntxna ApplicationArgs 1\nbtoi\n==\nassert\nint 0\ngtxns XferAsset\ntxna Assets 0\n==\nassert\nint 0\ngtxns Sender\ntxn Sender\n==\nassert\nint 0\ngtxns AssetReceiver\nglobal CurrentApplicationAddress\n==\nassert\ntxna ApplicationArgs 0\nlog\ntxna Assets 0\nitob\nlog\ntxna Accounts 1\nlog\ntxna ApplicationArgs 1\nlog\nint 1\nreturn\nmain_l16:\nint 1\ngtxns Sender\nbyte "server_address"\napp_global_get\n==\nassert\ntxna ApplicationArgs 0\nlog\ntxna ApplicationArgs 1\nbtoi\ncallsub executeAssetTransferTxn_1\ntxna Accounts 1\nlog\ntxna ApplicationArgs 1\nlog\nint 1\nreturn\nmain_l17:\nint 1\ngtxns Sender\nbyte "server_address"\napp_global_get\n==\nassert\ntxna ApplicationArgs 0\nlog\nint 9223372036854775806\nint 0\ncallsub executeAssetCreationTxn_0\ntxna Accounts 1\nlog\nint 1\nreturn\nmain_l18:\nint 0\ngtxns AssetAmount\nint 1\n==\nassert\nint 0\ngtxns XferAsset\ntxna Assets 0\n==\nassert\nint 0\ngtxns Sender\ntxn Sender\n==\nassert\nint 0\ngtxns AssetReceiver\nglobal CurrentApplicationAddress\n==\nassert\ntxna ApplicationArgs 0\nlog\ncallsub executeAssetDestroyTxn_2\ntxna Accounts 1\nlog\nint 1\nreturn\nmain_l19:\nint 1\ngtxns Sender\nbyte "server_address"\napp_global_get\n==\nassert\ntxna ApplicationArgs 0\nlog\nint 1\ncallsub executeAssetTransferTxn_1\ntxna Accounts 1\nlog\nint 1\nreturn\nmain_l20:\nint 1\ngtxns Sender\nbyte "server_address"\napp_global_get\n==\nassert\ntxna ApplicationArgs 0\nlog\nint 1\nint 0\ncallsub executeAssetCreationTxn_0\ntxna Accounts 1\nlog\nint 1\nreturn\nmain_l21:\nint 0\ngtxns AssetAmount\ntxna ApplicationArgs 1\nbtoi\n==\nassert\nint 0\ngtxns XferAsset\ntxna Assets 0\n==\nassert\nint 0\ngtxns Sender\ntxn Sender\n==\nassert\nint 0\ngtxns AssetReceiver\nglobal CurrentApplicationAddress\n==\nassert\ntxna ApplicationArgs 0\nlog\ntxna Assets 0\nitob\nlog\ntxna Accounts 1\nlog\ntxna ApplicationArgs 1\nlog\nint 1\nreturn\nmain_l22:\nint 1\ngtxns Sender\nbyte "server_address"\napp_global_get\n==\nassert\ntxna ApplicationArgs 0\nlog\ntxna ApplicationArgs 1\nbtoi\ncallsub executeAssetTransferTxn_1\ntxna Accounts 1\nlog\ntxna ApplicationArgs 1\nlog\nint 1\nreturn\nmain_l23:\nint 1\ngtxns Sender\nbyte "admin_address"\napp_global_get\n==\nassert\ntxna ApplicationArgs 0\nlog\nint 9223372036854775806\nint 6\ncallsub executeAssetCreationTxn_0\ntxna Accounts 1\nlog\nint 1\nreturn\nmain_l24:\nbyte "server_address"\ntxna ApplicationArgs 0\napp_global_put\nbyte "admin_address"\ntxna ApplicationArgs 1\napp_global_put\nint 1\nreturn\n\n// executeAssetCreationTxn\nexecuteAssetCreationTxn_0:\nstore 1\nstore 0\nitxn_begin\nint acfg\nitxn_field TypeEnum\ntxna ApplicationArgs 1\nitxn_field ConfigAssetName\ntxna ApplicationArgs 2\nitxn_field ConfigAssetUnitName\ntxna ApplicationArgs 3\nitxn_field ConfigAssetURL\nload 0\nitxn_field ConfigAssetTotal\nload 1\nitxn_field ConfigAssetDecimals\nglobal CurrentApplicationAddress\nitxn_field ConfigAssetManager\nglobal CurrentApplicationAddress\nitxn_field ConfigAssetReserve\nglobal CurrentApplicationAddress\nitxn_field ConfigAssetFreeze\nglobal CurrentApplicationAddress\nitxn_field ConfigAssetClawback\nitxn_submit\nitxn CreatedAssetID\nitob\nlog\nretsub\n\n// executeAssetTransferTxn\nexecuteAssetTransferTxn_1:\nstore 2\nitxn_begin\nint axfer\nitxn_field TypeEnum\ntxna Assets 0\nitxn_field XferAsset\ntxna Accounts 1\nitxn_field AssetReceiver\nload 2\nitxn_field AssetAmount\nitxn_submit\ntxna Assets 0\nitob\nlog\nretsub\n\n// executeAssetDestroyTxn\nexecuteAssetDestroyTxn_2:\nitxn_begin\nint acfg\nitxn_field TypeEnum\ntxna Assets 0\nitxn_field ConfigAsset\nitxn_submit\ntxna Assets 0\nitob\nlog\nretsub';
  const clearStateProgram = '#pragma version 5\nint 1\nreturn';

  const approvalCompile = await compileProgram(client, approvalProgram);
  const clearStateCompile = await compileProgram(client, clearStateProgram);
  return { approvalCompile, clearStateCompile };
};

const getMainContractMarketplace = async (client: algosdk.Algodv2) => {
  const approvalProgram =
  '#pragma version 5\ntxn ApplicationID\nint 0\n==\nbnz main_l14\ntxn OnCompletion\nint NoOp\n==\nbnz main_l11\ntxn OnCompletion\nint DeleteApplication\n==\nbnz main_l6\ntxn OnCompletion\nint OptIn\n==\ntxn OnCompletion\nint CloseOut\n==\n||\ntxn OnCompletion\nint UpdateApplication\n==\n||\nbnz main_l5\nerr\nmain_l5:\nint 0\nreturn\nmain_l6:\ntxna ApplicationArgs 0\nbyte "buy"\n==\nbnz main_l10\ntxna ApplicationArgs 0\nbyte "cancel"\n==\nbnz main_l9\nerr\nmain_l9:\ntxn Sender\nbyte "seller"\napp_global_get\n==\ntxn Sender\nglobal CreatorAddress\n==\n||\nassert\nbyte "nft_id"\napp_global_get\ncallsub closeNFTTo_0\nbyte "seller"\napp_global_get\ncallsub closeAccountTo_1\nbyte "on_cancel"\nlog\nint 1\nreturn\nmain_l10:\nglobal CurrentApplicationAddress\nbyte "nft_id"\napp_global_get\nasset_holding_get AssetBalance\nstore 1\nstore 0\nload 1\nload 0\nint 0\n>\n&&\nload 0\nbyte "nft_quantity"\napp_global_get\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns TypeEnum\nint pay\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Sender\ntxn Sender\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Receiver\nglobal CurrentApplicationAddress\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Amount\nglobal MinTxnFee\n>=\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Amount\nbyte "nft_price"\napp_global_get\n>=\n&&\nassert\nbyte "nft_id"\napp_global_get\ncallsub closeNFTTo_0\nbyte "seller"\napp_global_get\ncallsub closeAccountTo_1\nbyte "on_buy"\nlog\nint 1\nreturn\nmain_l11:\ntxna ApplicationArgs 0\nbyte "sell"\n==\nbnz main_l13\nerr\nmain_l13:\nbyte "nft_status"\napp_global_get\nbyte "on_sell"\n!=\nassert\nitxn_begin\nint axfer\nitxn_field TypeEnum\nbyte "nft_id"\napp_global_get\nitxn_field XferAsset\nglobal CurrentApplicationAddress\nitxn_field AssetReceiver\nitxn_submit\nbyte "nft_status"\nbyte "on_sell"\napp_global_put\nint 1\nreturn\nmain_l14:\nbyte "seller"\ntxna ApplicationArgs 0\napp_global_put\nbyte "nft_id"\ntxna ApplicationArgs 1\nbtoi\napp_global_put\nbyte "nft_price"\ntxna ApplicationArgs 2\nbtoi\napp_global_put\nbyte "nft_quantity"\ntxna ApplicationArgs 3\nbtoi\napp_global_put\nbyte "nft_status"\nbyte "on_create"\napp_global_put\nint 1\nreturn\n\n// closeNFTTo\ncloseNFTTo_0:\nstore 2\nglobal CurrentApplicationAddress\nload 2\nasset_holding_get AssetBalance\nstore 4\nstore 3\nload 4\nbz closeNFTTo_0_l2\nitxn_begin\nint axfer\nitxn_field TypeEnum\nload 2\nitxn_field XferAsset\ntxn Sender\nitxn_field AssetCloseTo\nitxn_submit\ncloseNFTTo_0_l2:\nretsub\n\n// closeAccountTo\ncloseAccountTo_1:\nstore 5\nglobal CurrentApplicationAddress\nbalance\nint 0\n!=\nbz closeAccountTo_1_l2\nitxn_begin\nint pay\nitxn_field TypeEnum\nload 5\nitxn_field CloseRemainderTo\nitxn_submit\ncloseAccountTo_1_l2:\nretsub';
  const clearStateProgram = '#pragma version 5\nint 1\nreturn';

  const approvalCompile = await compileProgram(client, approvalProgram);
  const clearStateCompile = await compileProgram(client, clearStateProgram);
  return { approvalCompile, clearStateCompile };
};

const importAccount1 = () => {
  const account = algosdk.mnemonicToSecretKey(
    'bonus fabric wise whale possible bunker ritual rhythm element stable sad deposit doll promote museum fun giggle peasant crash retreat beauty rigid gadget absorb rib',
  );
  return account;
};
const importAccount2 = () => {
  const account = algosdk.mnemonicToSecretKey(
    'harsh burst bacon inform arena before online cycle train survey blind depth stem crazy local blossom arrive census olympic grow miss subway clean abandon casual',
  );
  return account;
};
const importBuyerAccount = () => {
  const account = algosdk.mnemonicToSecretKey(
    'bless friend cinnamon truth toast life pistol assist fossil moral monkey virus repeat robot panic unlock square glove minimum leopard fat cushion priority about coffee'
  );
  return account
}
const importClient = (): algosdk.Algodv2 => {
  const algodToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const algodServer = 'http://localhost';
  const algodPort = 4001;
  const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

  return algodClient;
};
