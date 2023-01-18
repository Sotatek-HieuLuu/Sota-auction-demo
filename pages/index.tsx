import { WalletUI } from '@algoscan/use-wallet-ui';
import { Inter } from '@next/font/google';
import { useWallet } from '@txnlab/use-wallet';
import algosdk, { encodeUnsignedTransaction } from 'algosdk';
import { Card, InputNumber, Modal } from 'antd';
import { useRef, useState } from 'react';
import { createMainContractAndFullTest, createTokenGenerator, verify } from '../api/deployment';
import { getListNFT, initClient } from '../api/walletInteract';
import NFTList from '../components/NFTList';
import styles from '../styles/Home.module.scss'; // use to name className by command style.<name>

const inter = Inter({ subsets: ['latin'] }); // normally font of heading text (h1, h2, ...)

const { Meta } = Card;

const Home = () => {
  const { activeAddress, signTransactions, sendTransactions } = useWallet();
  const [isOpenSell, setIsOpenSell] = useState(false);
  const [isOpenBid, setIsOpenBid] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [product, setProduct] = useState('');
  const productRef = useRef('');
  const assetsRef = useRef([]);
  const indexProductRef = useRef(-1);
  const bidAmountRef = useRef(-1);
  const appIdRef = useRef(0);

  const testVerify = async () => {
    let algodClient = initClient();
    if (activeAddress) {
      await verify(algodClient, activeAddress, signTransactions, sendTransactions);
    }
    console.log('end');
  };

  const handleConfirmModalSell = async () => {
    setConfirmLoading(true);
    let algodClient = initClient();
    if (activeAddress) {
      // await atomicMultiUser(algodClient, activeAddress, signTransactions, sendTransactions);
      createMainContractAndFullTest(algodClient, activeAddress, signTransactions, sendTransactions);
      //
      //
      //
      //
      // // //siu
      // // const appId = 152094636;

      // let assetUintName = 'Siuuu';
      // let assetUrl = 'https://i.kym-cdn.com/entries/icons/original/000/039/420/CR7_siiii.jpg';
      // let assetId1 = await mintAsset(
      //   algodClient,
      //   activeAddress,
      //   signTransactions,
      //   sendTransactions,
      //   appId,
      //   assetUintName,
      //   assetUrl,
      // );

      // await withdrawAsset(algodClient, activeAddress, signTransactions, sendTransactions, appId, assetId1);

      // //pessi

      // assetUintName = 'pessi';
      // assetUrl = 'https://pbs.twimg.com/profile_images/1406625739328339969/hA7N3ZXJ_400x400.jpg';
      // let assetId2 = await mintAsset(
      //   algodClient,
      //   activeAddress,
      //   signTransactions,
      //   sendTransactions,
      //   appId,
      //   assetUintName,
      //   assetUrl,
      // );
      // await withdrawAsset(algodClient, activeAddress, signTransactions, sendTransactions, appId, assetId2);

      //deposit

      // await depositAsset(algodClient, activeAddress, signTransactions, sendTransactions, appId, assetId2);
      // await depositAsset(algodClient, activeAddress, signTransactions, sendTransactions, appId, assetId1);

      setIsOpenSell(false);
      setConfirmLoading(false);
      setProduct(productRef.current);
    }
  };
  const handleConfirmModalBid = async () => {
    console.log('bidRef: ', bidAmountRef.current);
    setConfirmLoading(true);
    let algodClient = initClient();
    // testVerify();

    if (activeAddress && appIdRef) {
      // let txn = await createTransaction(algodClient, activeAddress);
      // const encodedTransaction = encodeUnsignedTransaction(txn);
      // let appId = await createAuctionApp(txn, algodClient, signTransactions, sendTransactions, encodedTransaction);
      // appIdRef.current = appId;
      // console.log(appId);
      // await placeBid(
      //   algodClient,
      //   activeAddress,
      //   signTransactions,
      //   sendTransactions,
      //   appIdRef.current,
      //   bidAmountRef.current * 1000000,
      // );
    }
    setConfirmLoading(false);
    setIsOpenBid(false);
  };

  const handleCancelModalSell = () => {
    setIsOpenSell(false);
    setProduct('');
  };
  const handleCancelModalBid = () => {
    setIsOpenBid(false);
  };

  const auctionProduct = async () => {
    let algodClient = initClient();
    if (activeAddress) {
      let assets = await getListNFT(activeAddress);
      assets = await Promise.all(
        assets.map(async (item: any, index: number) => {
          let image = await algodClient.getAssetByID(item['asset-id']).do();
          item = { ...item, image: image.params.url };
          return item;
        }),
      );
      assets = assets.filter((item: any) => item.amount !== 0);
      console.log(assets);
      assetsRef.current = assets;
      setIsOpenSell(true);
    }
  };
  const bidProduct = () => {
    setIsOpenBid(true);
  };

  const choosedProduct = (imageUrl: string, idx: number) => {
    productRef.current = imageUrl;
    indexProductRef.current = idx;
  };

  const handleChangeBidAmount = (value: number | null) => {
    if (value) bidAmountRef.current = value;
  };

  return (
    <div className={styles.homePage}>
      <div className={styles.header}>
        <div className={styles.connectWalletArea}>
          <WalletUI primary="#c44dff" textColor="#FF0000" />
        </div>
      </div>
      <div className={styles.main}>
        <h1 className={(inter.className, styles.header)}>Auction Demo</h1>
        <div className={styles.dataContainer}>
          {!activeAddress ? (
            <h2 style={{ color: '#ffffff' }}>Please connect to your wallet</h2>
          ) : (
            <>
              <div className={styles.auctionProduct}>
                {product !== '' ? (
                  <Card
                    className={styles.product}
                    hoverable
                    cover={<img alt="" src={product} style={{ width: '100%', height: '100%' }} />}
                  >
                    <Meta title="test" className={styles.detailProduct} />
                  </Card>
                ) : null}
              </div>
              <div className={styles.btnArea}>
                <div className={styles.btnBid}>
                  <button onClick={() => bidProduct()}>Bid</button>
                </div>
                <div className={styles.btnSell}>
                  <button onClick={() => auctionProduct()}>Sell</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <Modal
        title="My NFTs"
        open={isOpenSell}
        onOk={handleConfirmModalSell}
        confirmLoading={confirmLoading}
        onCancel={handleCancelModalSell}
        style={{ top: '20%', zIndex: '9' }}
      >
        <NFTList nft={assetsRef.current} chooseProduct={choosedProduct} />
      </Modal>
      <Modal
        title="Your Bid Amount"
        open={isOpenBid}
        onOk={handleConfirmModalBid}
        confirmLoading={confirmLoading}
        onCancel={handleCancelModalBid}
      >
        <InputNumber
          min={0.1}
          max={100}
          defaultValue={1}
          step={0.1}
          onChange={(value) => handleChangeBidAmount(value)}
        />
      </Modal>
    </div>
  );
};

export default Home;
