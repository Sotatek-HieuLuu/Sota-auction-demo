import algosdk, { Algodv2 } from 'algosdk';
import { Account } from 'algosdk';

export const createAuctionApp = async (client: algosdk.Algodv2, account: Account) => {
  const contracts = await getContracts(client);

  const onComplete = algosdk.OnApplicationComplete.NoOpOC;
  const params = await client.getTransactionParams().do();

  const txn = algosdk.makeApplicationCreateTxn(
    account.addr,
    params,
    onComplete,
    contracts.approvalCompile,
    contracts.clearStateCompile,
    0,
    0,
    7,
    2,
  );

  const txId = txn.txID().toString();

  const signedTxn = txn.signTxn(account.sk);
  console.log('Signed transaction with txID: %s', txId);

  await client.sendRawTransaction(signedTxn).do();

  const confirmedTxn = await algosdk.waitForConfirmation(client, txId, 4);
  console.log('confirmed' + confirmedTxn);

  console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

  const transactionResponse = await client.pendingTransactionInformation(txId).do();

  const appId = transactionResponse['application-index'];
  console.log('Created new app-id: ', appId);
  return appId;
};

export const setupAuctionApp = async (
  client: algosdk.Algodv2,
  account: Account,
  appId: number,
  nftId: number,
  reserve: number,
  minBidIncrement: number,
) => {
  const params = await client.getTransactionParams().do();
  const fundingAmount = 1000000;

  let appArgs = [];
  appArgs.push(
    new Uint8Array(Buffer.from('setup')),
    algosdk.encodeUint64(reserve),
    algosdk.encodeUint64(minBidIncrement),
    // new Uint8Array(Buffer.from([reserve])),
    // new Uint8Array(Buffer.from([minBidIncrement])),
  );

  const appAddr = algosdk.getApplicationAddress(appId);
  console.log(appAddr);

  const fundAppTxn = algosdk.makePaymentTxnWithSuggestedParams(
    account.addr,
    appAddr,
    fundingAmount,
    undefined,
    undefined,
    params,
  );

  const setupTxn = algosdk.makeApplicationNoOpTxn(account.addr, params, appId, appArgs, [account.addr], undefined, [
    nftId,
  ]);

  const fundNftTxn = algosdk.makeAssetTransferTxnWithSuggestedParams(
    account.addr,
    appAddr,
    undefined,
    undefined,
    1,
    undefined,
    nftId,
    params,
  );

  //Assign
  algosdk.assignGroupID([fundAppTxn, setupTxn, fundNftTxn]);

  //Sign
  const signedFundAppTxn = fundAppTxn.signTxn(account.sk);
  const signedSetupTxn = setupTxn.signTxn(account.sk);
  const signedFundNftTxn = fundNftTxn.signTxn(account.sk);

  //Send
  await client.sendRawTransaction([signedFundAppTxn, signedSetupTxn, signedFundNftTxn]).do();

  const txId = fundAppTxn.txID().toString();

  const confirmedTxn = await algosdk.waitForConfirmation(client, txId, 4);
  console.log('confirmed' + confirmedTxn);

  console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

  const transactionResponse = await client.pendingTransactionInformation(txId).do();
};
export const placeBid = async (client: algosdk.Algodv2, account: Account, appId: number, bidAmount: number) => {
  const params = await client.getTransactionParams().do();

  let appArgs = [new Uint8Array(Buffer.from('bid'))];
  // appArgs.push(new Uint8Array(Buffer.from('bid')));
  const appAddr = algosdk.getApplicationAddress(appId);

  const globalState = await readGlobalState(client, appId);

  const nftId = globalState.filter((item: any) => {
    return item.key == btoa(encodeURIComponent('nft_id'));
  })[0].value.uint;

  const prevBidLeader = globalState.filter((item: any) => {
    return item.key == btoa(encodeURIComponent('bid_account'));
  })[0]?.value.bytes;

  let accounts: string[] = [];
  if (prevBidLeader) {
    accounts = [algosdk.encodeAddress(Buffer.from(prevBidLeader, 'base64'))];
  }

  const fundAppTxn = algosdk.makePaymentTxnWithSuggestedParams(
    account.addr,
    appAddr,
    bidAmount,
    undefined,
    undefined,
    params,
  );

  const setupTxn = algosdk.makeApplicationNoOpTxn(account.addr, params, appId, appArgs, accounts, undefined, [nftId]);

  //Assign
  algosdk.assignGroupID([fundAppTxn, setupTxn]);

  //Sign
  const signedFundAppTxn = fundAppTxn.signTxn(account.sk);
  const signedSetupTxn = setupTxn.signTxn(account.sk);

  //Send
  await client.sendRawTransaction([signedFundAppTxn, signedSetupTxn]).do();

  const txId = fundAppTxn.txID().toString();

  const confirmedTxn = await algosdk.waitForConfirmation(client, txId, 4);
  console.log('confirmed' + confirmedTxn);

  console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);

  const transactionResponse = await client.pendingTransactionInformation(txId).do();
};
export const closeAuction = (client: algosdk.Algodv2) => {};

export const readGlobalState = async (client: algosdk.Algodv2, appId: number) => {
  try {
    let applicationInfoResponse = await client.getApplicationByID(appId).do();
    console.log(applicationInfoResponse);
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
