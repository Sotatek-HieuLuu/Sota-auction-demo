import algosdk, {
  encodeUint64
} from 'algosdk';

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
const importClient = (): algosdk.Algodv2 => {
  const algodToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const algodServer = 'http://localhost';
  const algodPort = 4001;
  const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

  return algodClient;
};
