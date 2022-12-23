import algosdk from 'algosdk';
import { Account, Transaction } from 'algosdk';

export const createTransaction = async (client: algosdk.Algodv2, activeAddress: string): Promise<Transaction> => {
  const contracts = await getContracts(client);

  const onComplete = algosdk.OnApplicationComplete.NoOpOC;
  const params = await client.getTransactionParams().do();

  const txn = algosdk.makeApplicationCreateTxn(
    activeAddress,
    params,
    onComplete,
    contracts.approvalCompile,
    contracts.clearStateCompile,
    0,
    0,
    7,
    2,
  );

  return txn;
};

export const createAuctionApp = async (
  txn: Transaction,
  client: algosdk.Algodv2,
  signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
  sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
  encodedTransaction: Uint8Array,
) => {
  // const contracts = await getContracts(client);

  // const onComplete = algosdk.OnApplicationComplete.NoOpOC;
  // const params = await client.getTransactionParams().do();

  // const txn = algosdk.makeApplicationCreateTxn(
  //   account.addr,
  //   params,
  //   onComplete,
  //   contracts.approvalCompile,
  //   contracts.clearStateCompile,
  //   0,
  //   0,
  //   7,
  //   2,
  // );

  // const txn = await createTransaction(client, account.addr);

  const txId = txn.txID().toString();

  // const signedTxn = txn.signTxn(account.sk);
  const signedTxn = await signTransactions([encodedTransaction]);

  console.log('Signed transaction with txID: %s', txId);
  console.log('Signed transaction with signedTxn: %s', typeof signedTxn, signedTxn);

  // await client.sendRawTransaction(signedTxn).do();

  // const confirmedTxn = await algosdk.waitForConfirmation(client, txId, 4);
  // console.log('confirmed' + confirmedTxn);

  // console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

  // const transactionResponse = await client.pendingTransactionInformation(txId).do();

  const transactionResponse = await sendTransactions(signedTxn, 4);
  console.log('trans; ', transactionResponse);

  const appId = transactionResponse['application-index'];
  console.log('Created new app-id: ', appId);
  return appId;
};

export const setupAuctionApp = async (
  client: algosdk.Algodv2,
  // account: Account,
  activeAddress: string,
  signTransactions: (encodedTransaction: Uint8Array[]) => Promise<Uint8Array[]>,
  sendTransactions: (transactions: Uint8Array[], waitRoundsToConfirm?: number | undefined) => Promise<any>,
  encodeUnsignedTransaction: (transactionObject: algosdk.Transaction) => Uint8Array,
  appId: number,
  nftId: number,
  reserve: number,
  minBidIncrement: number,
) => {
  const onComplete = algosdk.OnApplicationComplete.NoOpOC;
  const params = await client.getTransactionParams().do();
  const fundingAmount = 1000000;

  let appArgs = [];
  appArgs.push(
    new Uint8Array(Buffer.from('setup')),
    new Uint8Array(Buffer.from(intToBytes(reserve))),
    new Uint8Array(Buffer.from(intToBytes(minBidIncrement))),
  );

  const appAddr = algosdk.getApplicationAddress(appId);
  console.log('appAddress: ', appAddr);

  const fundAppTxn = algosdk.makePaymentTxnWithSuggestedParams(
    activeAddress,
    appAddr,
    fundingAmount,
    undefined,
    undefined,
    params,
  );
  const encodedFundAppTxn = encodeUnsignedTransaction(fundAppTxn);

  const setupTxn = algosdk.makeApplicationNoOpTxn(activeAddress, params, appId, appArgs, [activeAddress], undefined, [
    nftId,
  ]);
  const encodedSetupTxn = encodeUnsignedTransaction(setupTxn);

  const fundNftTxn = algosdk.makeAssetTransferTxnWithSuggestedParams(
    activeAddress,
    appAddr,
    undefined,
    undefined,
    1,
    undefined,
    nftId,
    params,
  );
  const encodedFundNftTxn = encodeUnsignedTransaction(fundNftTxn);

  //Assign
  // algosdk.assignGroupID([fundAppTxn, setupTxn, fundNftTxn]);

  //Sign
  // const signedFundAppTxn = fundAppTxn.signTxn(account.sk);
  const signedTxn = await signTransactions([encodedFundAppTxn, encodedSetupTxn, encodedFundNftTxn]);
  console.log('signed: ', signedTxn);
  // const signedSetupTxn = setupTxn.signTxn(account.sk);
  // const signedSetupTxn = await signTransactions([encodedSetupTxn]);
  // const signedFundNftTxn = fundNftTxn.signTxn(account.sk);
  // const signedFundNftTxn = await signTransactions([encodedFundNftTxn]);

  //Send
  for (let i = 0; i < signedTxn.length; i++) {
    const trans = await sendTransactions([signedTxn[i]], 4);
    console.log('trans; ', trans);
  }
  // await client.sendRawTransaction(signedTxn).do();
  // await client.sendRawTransaction(signedFundAppTxn).do();
  // await client.sendRawTransaction(signedSetupTxn).do();
  // await client.sendRawTransaction(signedFundNftTxn).do();

  // const txId = fundAppTxn.txID().toString();

  // const confirmedTxn = await algosdk.waitForConfirmation(client, txId, 4);
  // console.log('confirmed' + confirmedTxn);

  // console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

  // const transactionResponse = await client.pendingTransactionInformation(txId).do();

  // const signedFundAppTxn = await signTransactions([encodedFundAppTxn]);
  // const transFundAppTxn = await sendTransactions(signedFundAppTxn, 4);
  // console.log('fundApp: ', transFundAppTxn);

  // const signedSetupTxn = await signTransactions([encodedSetupTxn]);
  // const transSetupTxn = await sendTransactions(signedSetupTxn, 4);
  // console.log('setup: ', transSetupTxn);

  // const signedFundNftTxn = await signTransactions([encodedFundNftTxn]);
  // const transFundNftTxn = await sendTransactions(signedFundNftTxn, 4);
  // console.log('fundNft: ', transFundNftTxn);
};
export const placeBid = (client: algosdk.Algodv2) => {};
export const closeAuction = (client: algosdk.Algodv2) => {};

export const readGlobalState = async (client: algosdk.Algodv2, appId: number) => {
  try {
    let applicationInfoResponse = await client.getApplicationByID(appId).do();
    let globalState = applicationInfoResponse['params']['global-state'];
    return globalState.map((state: any) => {
      return state;
    });
  } catch (err) {
    console.log(err);
  }
};

const importAccount = () => {
  const account = algosdk.mnemonicToSecretKey(
    'bonus fabric wise whale possible bunker ritual rhythm element stable sad deposit doll promote museum fun giggle peasant crash retreat beauty rigid gadget absorb rib',
  );
  console.log('private key', account.sk);
  return account;
};

const initClient = (): algosdk.Algodv2 => {
  const algodToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const algodServer = 'http://localhost';
  const algodPort = 4001;
  const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

  return algodClient;
};

// not to export

const intToBytes = (integer: number) => {
  return integer.toString();
};

const compileProgram = async (client: algosdk.Algodv2, program: any) => {
  let encoder = new TextEncoder();
  let programBytes = encoder.encode(program);
  let compileResponse = await client.compile(programBytes).do();
  let compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'));
  return compiledBytes;
};
const getContracts = async (client: algosdk.Algodv2) => {
  const approvalProgram =
    '#pragma version 5\ntxn ApplicationID\nint 0\n==\nbnz main_l21\ntxn OnCompletion\nint NoOp\n==\nbnz main_l12\ntxn OnCompletion\nint DeleteApplication\n==\nbnz main_l6\ntxn OnCompletion\nint OptIn\n==\ntxn OnCompletion\nint CloseOut\n==\n||\ntxn OnCompletion\nint UpdateApplication\n==\n||\nbnz main_l5\nerr\nmain_l5:\nint 0\nreturn\nmain_l6:\nbyte "bid_account"\napp_global_get\nglobal ZeroAddress\n!=\nbnz main_l9\nbyte "nft_id"\napp_global_get\nbyte "seller"\napp_global_get\ncallsub closeNFTTo_0\nmain_l8:\nbyte "seller"\napp_global_get\ncallsub closeAccountTo_2\nint 1\nreturn\nint 0\nreturn\nmain_l9:\nbyte "bid_amount"\napp_global_get\nbyte "reserve_amount"\napp_global_get\n>=\nbnz main_l11\nbyte "nft_id"\napp_global_get\nbyte "seller"\napp_global_get\ncallsub closeNFTTo_0\nbyte "bid_account"\napp_global_get\nbyte "bid_amount"\napp_global_get\ncallsub repayPreviousLeadBidder_1\nb main_l8\nmain_l11:\nbyte "nft_id"\napp_global_get\nbyte "bid_account"\napp_global_get\ncallsub closeNFTTo_0\nb main_l8\nmain_l12:\ntxna ApplicationArgs 0\nbyte "setup"\n==\nbnz main_l20\ntxna ApplicationArgs 0\nbyte "bid"\n==\nbnz main_l15\nerr\nmain_l15:\nglobal CurrentApplicationAddress\nbyte "nft_id"\napp_global_get\nasset_holding_get AssetBalance\nstore 1\nstore 0\nload 1\nload 0\nint 0\n>\n&&\ntxn GroupIndex\nint 1\n-\ngtxns TypeEnum\nint pay\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Sender\ntxn Sender\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Receiver\nglobal CurrentApplicationAddress\n==\n&&\ntxn GroupIndex\nint 1\n-\ngtxns Amount\nglobal MinTxnFee\n>=\n&&\nassert\ntxn GroupIndex\nint 1\n-\ngtxns Amount\nbyte "bid_amount"\napp_global_get\nbyte "min_bid_inc"\napp_global_get\n+\n>=\nbnz main_l17\nint 0\nreturn\nmain_l17:\nbyte "bid_account"\napp_global_get\nglobal ZeroAddress\n!=\nbnz main_l19\nmain_l18:\nbyte "bid_amount"\ntxn GroupIndex\nint 1\n-\ngtxns Amount\napp_global_put\nbyte "bid_account"\ntxn GroupIndex\nint 1\n-\ngtxns Sender\napp_global_put\nbyte "num_bids"\nbyte "num_bids"\napp_global_get\nint 1\n+\napp_global_put\nint 1\nreturn\nmain_l19:\nbyte "bid_account"\napp_global_get\nbyte "bid_amount"\napp_global_get\ncallsub repayPreviousLeadBidder_1\nb main_l18\nmain_l20:\nbyte "seller"\ntxna Accounts 1\napp_global_put\nbyte "nft_id"\ntxna Assets 0\napp_global_put\nbyte "reserve_amount"\ntxna ApplicationArgs 1\nbtoi\napp_global_put\nbyte "min_bid_inc"\ntxna ApplicationArgs 2\nbtoi\napp_global_put\nbyte "bid_account"\nglobal ZeroAddress\napp_global_put\nitxn_begin\nint axfer\nitxn_field TypeEnum\nbyte "nft_id"\napp_global_get\nitxn_field XferAsset\nglobal CurrentApplicationAddress\nitxn_field AssetReceiver\nitxn_submit\nint 1\nreturn\nmain_l21:\nint 1\nreturn\n\n// closeNFTTo\ncloseNFTTo_0:\nstore 3\nstore 2\nglobal CurrentApplicationAddress\nload 2\nasset_holding_get AssetBalance\nstore 5\nstore 4\nload 5\nbz closeNFTTo_0_l2\nitxn_begin\nint axfer\nitxn_field TypeEnum\nload 2\nitxn_field XferAsset\nload 3\nitxn_field AssetCloseTo\nitxn_submit\ncloseNFTTo_0_l2:\nretsub\n\n// repayPreviousLeadBidder\nrepayPreviousLeadBidder_1:\nstore 7\nstore 6\nitxn_begin\nint pay\nitxn_field TypeEnum\nload 7\nglobal MinTxnFee\n-\nitxn_field Amount\nload 6\nitxn_field Receiver\nitxn_submit\nretsub\n\n// closeAccountTo\ncloseAccountTo_2:\nstore 8\nglobal CurrentApplicationAddress\nbalance\nint 0\n!=\nbz closeAccountTo_2_l2\nitxn_begin\nint pay\nitxn_field TypeEnum\nload 8\nitxn_field CloseRemainderTo\nitxn_submit\ncloseAccountTo_2_l2:\nretsub';
  const clearStateProgram = '#pragma version 5\nint 1\nreturn';

  const approvalCompile = await compileProgram(client, approvalProgram);
  const clearStateCompile = await compileProgram(client, clearStateProgram);
  return { approvalCompile, clearStateCompile };
};
